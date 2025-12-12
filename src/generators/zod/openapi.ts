/**
 * OpenAPI to Zod schema generation
 * Converts OpenAPI schemas to Zod validation schemas
 */

import {
  addSchemaToContext,
  buildZodOutput,
  createZodGenContext,
  getSafePropertyName,
  isSchemaReference,
  toPascalCase,
  toSchemaName,
} from "./index";

import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type { ParsedOperation } from "@/adapters/openapi/schema";
import type { ZodGenContext } from "./index";

type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
type OpenAPIDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

/**
 * Extended context for OpenAPI Zod generation
 */
interface OpenAPIZodContext extends ZodGenContext {
  /** All named schemas from components */
  namedSchemas: Record<string, SchemaObject>;
}

/**
 * Options for OpenAPI Zod generation
 */
export interface OpenAPIZodOptions {
  /** Only generate schemas for these operations (by operationId) */
  operationIds?: string[];
}

/**
 * Result of OpenAPI Zod generation
 */
export interface OpenAPIZodResult {
  /** Generated code content */
  content: string;
  /** Warnings during generation */
  warnings: string[];
}

/**
 * Generate Zod schemas from an OpenAPI document
 */
export function generateOpenAPIZodSchemas(
  document: OpenAPIDocument,
  operations: ParsedOperation[],
  options: OpenAPIZodOptions = {},
): OpenAPIZodResult {
  const ctx: OpenAPIZodContext = {
    ...createZodGenContext(),
    namedSchemas: {},
  };

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

  // Generate Zod schemas for used component schemas (in dependency order)
  for (const schemaName of usedSchemas) {
    if (ctx.namedSchemas[schemaName] && !ctx.generatedSchemas.has(schemaName)) {
      generateZodSchema(schemaName, ctx.namedSchemas[schemaName], ctx);
    }
  }

  // Process any remaining pending schemas (dependencies discovered during generation)
  processPendingSchemas(ctx);

  // Generate inline schemas for request/response types
  generateOperationSchemas(targetOperations, ctx);

  return {
    content: buildZodOutput(ctx),
    warnings: ctx.warnings,
  };
}

/**
 * Collect all schema names used by operations
 */
function collectUsedSchemas(
  operations: ParsedOperation[],
  ctx: OpenAPIZodContext,
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

/**
 * Process any pending schemas that were discovered as dependencies
 */
function processPendingSchemas(ctx: OpenAPIZodContext): void {
  while (ctx.pendingSchemas.size > 0) {
    const entries = [...ctx.pendingSchemas.entries()];
    ctx.pendingSchemas.clear();

    for (const [name, schema] of entries) {
      if (!ctx.generatedSchemas.has(name)) {
        generateZodSchema(name, schema as SchemaObject, ctx);
      }
    }
  }
}

/**
 * Generate a Zod schema for a named schema
 */
function generateZodSchema(
  name: string,
  schema: SchemaObject,
  ctx: OpenAPIZodContext,
): void {
  if (ctx.generatedSchemas.has(name)) return;

  const zodType = schemaToZod(schema, ctx, name);
  addSchemaToContext(ctx, name, zodType);
}

/**
 * Generate schemas for operation request/response types
 */
function generateOperationSchemas(
  operations: ParsedOperation[],
  ctx: OpenAPIZodContext,
): void {
  for (const op of operations) {
    const baseName = toPascalCase(op.operationId);

    // Generate request body schema if present
    if (op.requestBody) {
      const requestName = `${baseName}Request`;
      if (!ctx.generatedSchemas.has(requestName)) {
        const zodType = schemaToZod(op.requestBody, ctx, requestName);

        // Check if this is just a reference to an existing schema
        if (!isSchemaReference(zodType)) {
          addSchemaToContext(ctx, requestName, zodType);
        }
      }
    }

    // Generate response schema if present
    if (op.responseSchema) {
      const responseName = `${baseName}Response`;
      if (!ctx.generatedSchemas.has(responseName)) {
        const zodType = schemaToZod(op.responseSchema, ctx, responseName);

        // Check if this is just a reference to an existing schema
        if (!isSchemaReference(zodType)) {
          addSchemaToContext(ctx, responseName, zodType);
        }
      }
    }

    // Generate params schema if there are path/query params
    const allParams = [...op.pathParams, ...op.queryParams];
    if (allParams.length > 0) {
      const paramsName = `${baseName}Params`;
      if (!ctx.generatedSchemas.has(paramsName)) {
        const paramsZod = generateParamsSchema(allParams, ctx);
        addSchemaToContext(ctx, paramsName, paramsZod);
      }
    }
  }
}

/**
 * Generate a Zod schema for operation parameters
 */
function generateParamsSchema(
  params: (OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject)[],
  ctx: OpenAPIZodContext,
): string {
  const fields: string[] = [];

  for (const param of params) {
    const paramSchema = param.schema as SchemaObject | undefined;
    const zodType = paramSchema ? schemaToZod(paramSchema, ctx) : "z.unknown()";
    const isRequired = param.required ?? false;

    const field = isRequired
      ? `  ${param.name}: ${zodType}`
      : `  ${param.name}: ${zodType}.optional()`;

    fields.push(field);
  }

  return `z.object({\n${fields.join(",\n")}\n})`;
}

/**
 * Convert an OpenAPI schema to a Zod type string
 */
export function schemaToZod(
  schema: SchemaObject,
  ctx: OpenAPIZodContext,
  currentName?: string,
): string {
  // Handle nullable (OpenAPI 3.0 uses nullable, 3.1 uses type: [x, "null"])
  const nullable = "nullable" in schema && schema.nullable === true;

  let zodType: string;

  // Check if this schema is a named schema (reference)
  for (const [name, namedSchema] of Object.entries(ctx.namedSchemas)) {
    if (schema === namedSchema && name !== currentName) {
      // Reference to a named schema
      if (!ctx.generatedSchemas.has(name) && !ctx.pendingSchemas.has(name)) {
        ctx.pendingSchemas.set(name, namedSchema);
      }
      zodType = toSchemaName(name);
      return nullable ? `${zodType}.nullable()` : zodType;
    }
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    const enumValues = schema.enum
      .filter((v): v is string | number | boolean => v !== null)
      .map((v) => (typeof v === "string" ? `"${v}"` : String(v)));
    zodType = `z.enum([${enumValues.join(", ")}])`;
    return nullable ? `${zodType}.nullable()` : zodType;
  }

  // Handle allOf (intersection)
  if (schema.allOf && schema.allOf.length > 0) {
    const schemas = schema.allOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToZod(s, ctx));

    if (schemas.length === 1 && schemas[0]) {
      zodType = schemas[0];
    } else if (schemas.length > 1 && schemas[0]) {
      zodType = `${schemas[0]}.and(${schemas.slice(1).join(").and(")})`;
    } else {
      zodType = "z.unknown()";
    }
    return nullable ? `${zodType}.nullable()` : zodType;
  }

  // Handle oneOf (union)
  if (schema.oneOf && schema.oneOf.length > 0) {
    const schemas = schema.oneOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToZod(s, ctx));

    if (schemas.length === 1 && schemas[0]) {
      zodType = schemas[0];
    } else if (schemas.length > 1) {
      zodType = `z.union([${schemas.join(", ")}])`;
    } else {
      zodType = "z.unknown()";
    }
    return nullable ? `${zodType}.nullable()` : zodType;
  }

  // Handle anyOf (union)
  if (schema.anyOf && schema.anyOf.length > 0) {
    const schemas = schema.anyOf
      .filter((s): s is SchemaObject => !("$ref" in s))
      .map((s) => schemaToZod(s, ctx));

    if (schemas.length === 1 && schemas[0]) {
      zodType = schemas[0];
    } else if (schemas.length > 1) {
      zodType = `z.union([${schemas.join(", ")}])`;
    } else {
      zodType = "z.unknown()";
    }
    return nullable ? `${zodType}.nullable()` : zodType;
  }

  // Handle by type
  switch (schema.type) {
    case "string":
      zodType = getStringZodType(schema);
      break;

    case "number":
    case "integer":
      zodType = schema.type === "integer" ? "z.number().int()" : "z.number()";
      break;

    case "boolean":
      zodType = "z.boolean()";
      break;

    case "array":
      if (schema.items && !("$ref" in schema.items)) {
        const itemType = schemaToZod(schema.items, ctx);
        zodType = `z.array(${itemType})`;
      } else {
        zodType = "z.array(z.unknown())";
      }
      break;

    case "object":
      zodType = getObjectZodType(schema, ctx);
      break;

    default:
      // No type specified - check for properties to infer object
      if (schema.properties) {
        zodType = getObjectZodType(schema, ctx);
      } else if (schema.additionalProperties) {
        zodType = getRecordZodType(schema, ctx);
      } else {
        zodType = "z.unknown()";
      }
  }

  return nullable ? `${zodType}.nullable()` : zodType;
}

/**
 * Get Zod type for string schema with format support
 */
function getStringZodType(schema: SchemaObject): string {
  switch (schema.format) {
    case "date-time":
      return "z.iso.datetime()";
    case "date":
      return "z.iso.date()";
    case "time":
      return "z.iso.time()";
    case "email":
      return "z.email()";
    case "uri":
    case "url":
      return "z.url()";
    case "uuid":
      return "z.uuid()";
    case "ipv4":
      return "z.ipv4()";
    case "ipv6":
      return "z.ipv6()";
    default:
      return "z.string()";
  }
}

/**
 * Get Zod type for object schema
 */
function getObjectZodType(
  schema: SchemaObject,
  ctx: OpenAPIZodContext,
): string {
  if (!schema.properties && !schema.additionalProperties) {
    return "z.object({})";
  }

  const fields: string[] = [];
  const required = new Set(schema.required || []);

  // Handle regular properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if ("$ref" in propSchema) continue;

      const propZod = schemaToZod(propSchema, ctx);
      const isRequired = required.has(propName);
      const safeName = getSafePropertyName(propName);

      if (isRequired) {
        fields.push(`  ${safeName}: ${propZod}`);
      } else {
        fields.push(`  ${safeName}: ${propZod}.optional()`);
      }
    }
  }

  let objectType = `z.object({\n${fields.join(",\n")}\n})`;

  // Handle additionalProperties
  if (schema.additionalProperties === true) {
    objectType = `${objectType}.passthrough()`;
  } else if (
    typeof schema.additionalProperties === "object" &&
    !("$ref" in schema.additionalProperties)
  ) {
    // If we have both properties and typed additionalProperties,
    // use catchall to allow additional typed properties
    const addPropType = schemaToZod(schema.additionalProperties, ctx);
    objectType = `${objectType}.catchall(${addPropType})`;
  }

  return objectType;
}

/**
 * Get Zod type for a record/dictionary schema (object with only additionalProperties)
 */
function getRecordZodType(
  schema: SchemaObject,
  ctx: OpenAPIZodContext,
): string {
  if (schema.additionalProperties === true) {
    return "z.record(z.string(), z.unknown())";
  }

  if (
    typeof schema.additionalProperties === "object" &&
    !("$ref" in schema.additionalProperties)
  ) {
    const valueType = schemaToZod(schema.additionalProperties, ctx);
    return `z.record(z.string(), ${valueType})`;
  }

  return "z.record(z.string(), z.unknown())";
}
