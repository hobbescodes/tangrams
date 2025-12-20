/**
 * OpenAPI to IR parser
 *
 * Converts OpenAPI schemas to the intermediate representation (IR)
 * that can be emitted to any validator library.
 */

import { toPascalCase } from "@/utils/naming";
import { createNamedSchema, topologicalSortSchemas } from "./utils";

import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type { ParsedOperation } from "@/adapters/openapi/schema";
import type {
  NamedSchemaIR,
  ObjectPropertyIR,
  SchemaIR,
  SchemaIRResult,
  StringFormat,
} from "./types";

type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
type OpenAPIDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

// ============================================================================
// Options & Context
// ============================================================================

/**
 * Options for OpenAPI IR parsing
 */
export interface OpenAPIIROptions {
  /** Only generate schemas for these operations (by operationId) */
  operationIds?: string[];
}

/**
 * Context for OpenAPI IR generation
 */
interface OpenAPIIRContext {
  /** All named schemas from components */
  namedSchemas: Record<string, SchemaObject>;
  /** Track generated schema names to avoid duplicates */
  generatedSchemas: Set<string>;
  /** Track schemas that need to be generated (dependencies) */
  pendingSchemas: Map<string, SchemaObject>;
  /** Generated named schemas */
  schemas: NamedSchemaIR[];
  /** Warnings during generation */
  warnings: string[];
}

function createContext(): OpenAPIIRContext {
  return {
    namedSchemas: {},
    generatedSchemas: new Set(),
    pendingSchemas: new Map(),
    schemas: [],
    warnings: [],
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse an OpenAPI document to IR
 */
export function parseOpenAPIToIR(
  document: OpenAPIDocument,
  operations: ParsedOperation[],
  options: OpenAPIIROptions = {},
): SchemaIRResult {
  const ctx = createContext();

  // Collect all named schemas from components
  if (document.components?.schemas) {
    for (const [name, schemaObj] of Object.entries(
      document.components.schemas,
    )) {
      // Skip reference objects (shouldn't happen after dereferencing)
      if (!("$ref" in schemaObj)) {
        ctx.namedSchemas[name] = schemaObj;
      }
    }
  }

  // Filter operations if operationIds specified
  let targetOperations = operations;
  if (options.operationIds) {
    const idSet = new Set(options.operationIds);
    targetOperations = operations.filter((op) => idSet.has(op.operationId));
  }

  // Collect all schemas used by operations
  const usedSchemas = collectUsedSchemas(targetOperations, ctx);

  // Generate IR for used component schemas (in dependency order)
  for (const schemaName of usedSchemas) {
    if (ctx.namedSchemas[schemaName] && !ctx.generatedSchemas.has(schemaName)) {
      generateSchemaIR(schemaName, ctx.namedSchemas[schemaName], ctx);
    }
  }

  // Process any remaining pending schemas (dependencies discovered during generation)
  processPendingSchemas(ctx);

  // Generate inline schemas for request/response types
  generateOperationSchemas(targetOperations, ctx);

  // Sort schemas topologically
  const sortedSchemas = topologicalSortSchemas(ctx.schemas);

  return {
    schemas: sortedSchemas,
    warnings: ctx.warnings,
  };
}

// ============================================================================
// Schema Collection
// ============================================================================

/**
 * Collect all schema names used by operations
 */
function collectUsedSchemas(
  operations: ParsedOperation[],
  ctx: OpenAPIIRContext,
): Set<string> {
  const usedSchemas = new Set<string>();

  for (const op of operations) {
    // Collect from request body
    if (op.requestBody) {
      collectSchemaRefs(op.requestBody, usedSchemas, ctx.namedSchemas);
    }

    // Collect from response
    if (op.responseSchema) {
      collectSchemaRefs(op.responseSchema, usedSchemas, ctx.namedSchemas);
    }

    // Collect from parameters
    for (const param of [...op.pathParams, ...op.queryParams]) {
      if (param.schema && !("$ref" in param.schema)) {
        collectSchemaRefs(param.schema, usedSchemas, ctx.namedSchemas);
      }
    }
  }

  return usedSchemas;
}

/**
 * Recursively collect schema references from a schema object
 */
function collectSchemaRefs(
  schema: SchemaObject,
  usedSchemas: Set<string>,
  namedSchemas: Record<string, SchemaObject>,
): void {
  // Check if this schema matches a named schema (for object types)
  for (const [name, namedSchema] of Object.entries(namedSchemas)) {
    if (schema === namedSchema) {
      usedSchemas.add(name);
    }
  }

  // Handle array items
  if (schema.type === "array" && schema.items && !("$ref" in schema.items)) {
    collectSchemaRefs(schema.items, usedSchemas, namedSchemas);
  }

  // Handle object properties
  if (schema.type === "object" && schema.properties) {
    for (const propSchema of Object.values(schema.properties)) {
      if (!("$ref" in propSchema)) {
        collectSchemaRefs(propSchema, usedSchemas, namedSchemas);
      }
    }
  }

  // Handle additionalProperties
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object" &&
    !("$ref" in schema.additionalProperties)
  ) {
    collectSchemaRefs(schema.additionalProperties, usedSchemas, namedSchemas);
  }

  // Handle allOf, oneOf, anyOf
  for (const key of ["allOf", "oneOf", "anyOf"] as const) {
    const schemas = schema[key];
    if (schemas) {
      for (const subSchema of schemas) {
        if (!("$ref" in subSchema)) {
          collectSchemaRefs(subSchema, usedSchemas, namedSchemas);
        }
      }
    }
  }
}

// ============================================================================
// Schema Generation
// ============================================================================

/**
 * Generate IR for a named schema
 */
function generateSchemaIR(
  name: string,
  schema: SchemaObject,
  ctx: OpenAPIIRContext,
): void {
  if (ctx.generatedSchemas.has(name)) return;

  ctx.generatedSchemas.add(name);
  const ir = schemaToIR(schema, ctx, name);
  ctx.schemas.push(createNamedSchema(name, ir, "component"));
}

/**
 * Process any pending schemas that were discovered as dependencies
 */
function processPendingSchemas(ctx: OpenAPIIRContext): void {
  while (ctx.pendingSchemas.size > 0) {
    const entries = [...ctx.pendingSchemas.entries()];
    ctx.pendingSchemas.clear();

    for (const [name, schema] of entries) {
      if (!ctx.generatedSchemas.has(name)) {
        generateSchemaIR(name, schema, ctx);
      }
    }
  }
}

/**
 * Generate schemas for operation request/response types
 */
function generateOperationSchemas(
  operations: ParsedOperation[],
  ctx: OpenAPIIRContext,
): void {
  for (const op of operations) {
    const baseName = toPascalCase(op.operationId);

    // Generate request body schema if present
    if (op.requestBody) {
      const requestName = `${baseName}Request`;
      if (!ctx.generatedSchemas.has(requestName)) {
        ctx.generatedSchemas.add(requestName);
        const ir = schemaToIR(op.requestBody, ctx, requestName);
        ctx.schemas.push(createNamedSchema(requestName, ir, "input"));
      }
    }

    // Generate response schema if present
    if (op.responseSchema) {
      const responseName = `${baseName}Response`;
      if (!ctx.generatedSchemas.has(responseName)) {
        ctx.generatedSchemas.add(responseName);
        const ir = schemaToIR(op.responseSchema, ctx, responseName);
        ctx.schemas.push(createNamedSchema(responseName, ir, "response"));
      }
    }

    // Generate params schema if there are path/query params
    const allParams = [...op.pathParams, ...op.queryParams];
    if (allParams.length > 0) {
      const paramsName = `${baseName}Params`;
      if (!ctx.generatedSchemas.has(paramsName)) {
        ctx.generatedSchemas.add(paramsName);
        const ir = generateParamsSchemaIR(allParams, ctx);
        ctx.schemas.push(createNamedSchema(paramsName, ir, "params"));
      }
    }
  }
}

/**
 * Generate IR for operation parameters
 */
function generateParamsSchemaIR(
  params: (OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject)[],
  ctx: OpenAPIIRContext,
): SchemaIR {
  const properties: Record<string, ObjectPropertyIR> = {};

  for (const param of params) {
    const paramSchema = param.schema as SchemaObject | undefined;
    const ir = paramSchema ? schemaToIR(paramSchema, ctx) : { kind: "unknown" };
    const isRequired = param.required ?? false;

    properties[param.name] = {
      schema: ir as SchemaIR,
      required: isRequired,
    };
  }

  return { kind: "object", properties };
}

// ============================================================================
// Schema to IR Conversion
// ============================================================================

/**
 * Convert an OpenAPI schema to IR
 */
export function schemaToIR(
  schema: SchemaObject,
  ctx: OpenAPIIRContext,
  currentName?: string,
): SchemaIR {
  // Handle nullable (OpenAPI 3.0 uses nullable, 3.1 uses type: [x, "null"])
  const nullable = "nullable" in schema && schema.nullable === true;

  let ir: SchemaIR;

  // Check if this schema is a named schema (reference)
  for (const [name, namedSchema] of Object.entries(ctx.namedSchemas)) {
    if (schema === namedSchema && name !== currentName) {
      // Reference to a named schema
      if (!ctx.generatedSchemas.has(name) && !ctx.pendingSchemas.has(name)) {
        ctx.pendingSchemas.set(name, namedSchema);
      }
      ir = { kind: "ref", name };
      return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
    }
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum.filter(
      (v): v is string | number => v !== null && v !== undefined,
    );
    ir = { kind: "enum", values: enumValues };
    return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
  }

  // Handle allOf (intersection)
  if (schema.allOf && schema.allOf.length > 0) {
    const members = schema.allOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToIR(s, ctx));

    if (members.length === 1 && members[0]) {
      ir = members[0];
    } else if (members.length > 1) {
      ir = { kind: "intersection", members };
    } else {
      ir = { kind: "unknown" };
    }
    return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
  }

  // Handle oneOf (union)
  if (schema.oneOf && schema.oneOf.length > 0) {
    const members = schema.oneOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToIR(s, ctx));

    if (members.length === 1 && members[0]) {
      ir = members[0];
    } else if (members.length > 1) {
      ir = { kind: "union", members };
    } else {
      ir = { kind: "unknown" };
    }
    return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
  }

  // Handle anyOf (union)
  if (schema.anyOf && schema.anyOf.length > 0) {
    const members = schema.anyOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToIR(s, ctx));

    if (members.length === 1 && members[0]) {
      ir = members[0];
    } else if (members.length > 1) {
      ir = { kind: "union", members };
    } else {
      ir = { kind: "unknown" };
    }
    return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
  }

  // Handle by type
  switch (schema.type) {
    case "string":
      ir = getStringIR(schema);
      break;

    case "number":
    case "integer":
      ir = { kind: "number", integer: schema.type === "integer" };
      break;

    case "boolean":
      ir = { kind: "boolean" };
      break;

    case "array":
      if (schema.items && !("$ref" in schema.items)) {
        const itemIR = schemaToIR(schema.items, ctx);
        ir = { kind: "array", items: itemIR };
      } else {
        ir = { kind: "array", items: { kind: "unknown" } };
      }
      break;

    case "object":
      ir = getObjectIR(schema, ctx);
      break;

    default:
      // No type specified - check for properties to infer object
      if (schema.properties) {
        ir = getObjectIR(schema, ctx);
      } else if (schema.additionalProperties) {
        ir = getRecordIR(schema, ctx);
      } else {
        ir = { kind: "unknown" };
      }
  }

  return nullable ? { kind: "union", members: [ir, { kind: "null" }] } : ir;
}

/**
 * Get IR for string schema with format support
 */
function getStringIR(schema: SchemaObject): SchemaIR {
  const formatMap: Record<string, StringFormat> = {
    "date-time": "datetime",
    date: "date",
    time: "time",
    email: "email",
    uri: "url",
    url: "url",
    uuid: "uuid",
    ipv4: "ipv4",
    ipv6: "ipv6",
  };

  const format = schema.format ? formatMap[schema.format] : undefined;

  return { kind: "string", format };
}

/**
 * Get IR for object schema
 */
function getObjectIR(schema: SchemaObject, ctx: OpenAPIIRContext): SchemaIR {
  if (!schema.properties && !schema.additionalProperties) {
    return { kind: "object", properties: {} };
  }

  const properties: Record<string, ObjectPropertyIR> = {};
  const required = new Set(schema.required || []);

  // Handle regular properties
  // Note: We store the original property name in the IR. The emitter is responsible
  // for applying getSafePropertyName() at code generation time.
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if ("$ref" in propSchema) continue;

      const propIR = schemaToIR(propSchema, ctx);
      const isRequired = required.has(propName);

      properties[propName] = {
        schema: propIR,
        required: isRequired,
      };
    }
  }

  // Handle additionalProperties
  let additionalProperties: boolean | SchemaIR | undefined;

  if (schema.additionalProperties === true) {
    additionalProperties = true; // passthrough
  } else if (
    typeof schema.additionalProperties === "object" &&
    !("$ref" in schema.additionalProperties)
  ) {
    additionalProperties = schemaToIR(schema.additionalProperties, ctx);
  }

  return { kind: "object", properties, additionalProperties };
}

/**
 * Get IR for a record/dictionary schema (object with only additionalProperties)
 */
function getRecordIR(schema: SchemaObject, ctx: OpenAPIIRContext): SchemaIR {
  if (schema.additionalProperties === true) {
    return {
      kind: "record",
      keyType: { kind: "string" },
      valueType: { kind: "unknown" },
    };
  }

  if (
    typeof schema.additionalProperties === "object" &&
    !("$ref" in schema.additionalProperties)
  ) {
    const valueIR = schemaToIR(schema.additionalProperties, ctx);
    return {
      kind: "record",
      keyType: { kind: "string" },
      valueType: valueIR,
    };
  }

  return {
    kind: "record",
    keyType: { kind: "string" },
    valueType: { kind: "unknown" },
  };
}
