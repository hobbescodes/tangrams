/**
 * GraphQL to IR parser
 *
 * Converts GraphQL types to the intermediate representation (IR)
 * that can be emitted to any validator library.
 */

import {
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
} from "graphql";

import {
  toFragmentTypeName,
  toMutationResponseTypeName,
  toMutationVariablesTypeName,
  toQueryResponseTypeName,
  toQueryVariablesTypeName,
} from "@/utils/naming";
import { createNamedSchema, topologicalSortSchemas } from "./utils";

import type {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLInterfaceType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
  GraphQLUnionType,
} from "graphql";
import type {
  ParsedDocuments,
  ParsedFragment,
  ParsedOperation,
} from "@/core/documents";
import type { ValidatorLibrary } from "@/generators/emitters/types";
import type {
  NamedSchemaIR,
  ObjectPropertyIR,
  SchemaIR,
  SchemaIRResult,
} from "./types";

// ============================================================================
// Default Scalar Mappings
// ============================================================================

/**
 * Default scalar mappings from GraphQL to IR
 */
const defaultScalarToIR: Record<string, SchemaIR> = {
  ID: { kind: "string" },
  String: { kind: "string" },
  Int: { kind: "number", integer: true },
  Float: { kind: "number" },
  Boolean: { kind: "boolean" },
  DateTime: { kind: "string", format: "datetime" },
  Date: { kind: "string", format: "date" },
  Time: { kind: "string", format: "time" },
  JSON: { kind: "unknown" },
  JSONObject: {
    kind: "record",
    keyType: { kind: "string" },
    valueType: { kind: "unknown" },
  },
  BigInt: { kind: "bigint" },
  UUID: { kind: "string", format: "uuid" },
};

// ============================================================================
// Custom Scalar Validation
// ============================================================================

/**
 * Valid prefixes for custom scalar code by validator library.
 * Custom scalars must start with one of these prefixes to be considered valid.
 */
const validatorPrefixes: Record<ValidatorLibrary, string[]> = {
  zod: ["z."],
  valibot: ["v."],
  arktype: ["type(", "type."],
  effect: ["Schema."],
};

/**
 * Suggested scalar code replacements for common invalid values.
 * Used to provide helpful error messages when users provide TypeScript types
 * instead of validator expressions.
 */
const scalarSuggestions: Record<ValidatorLibrary, Record<string, string>> = {
  zod: {
    string: "z.string()",
    String: "z.string()",
    number: "z.number()",
    Number: "z.number()",
    boolean: "z.boolean()",
    Boolean: "z.boolean()",
    Date: "z.string()",
    date: "z.string()",
    object: "z.object({})",
    any: "z.any()",
    unknown: "z.unknown()",
  },
  valibot: {
    string: "v.string()",
    String: "v.string()",
    number: "v.number()",
    Number: "v.number()",
    boolean: "v.boolean()",
    Boolean: "v.boolean()",
    Date: "v.string()",
    date: "v.string()",
    object: "v.object({})",
    any: "v.any()",
    unknown: "v.unknown()",
  },
  arktype: {
    string: 'type("string")',
    String: 'type("string")',
    number: 'type("number")',
    Number: 'type("number")',
    boolean: 'type("boolean")',
    Boolean: 'type("boolean")',
    Date: 'type("string")',
    date: 'type("string")',
    object: "type({})",
    any: 'type("unknown")',
    unknown: 'type("unknown")',
  },
  effect: {
    string: "Schema.String",
    String: "Schema.String",
    number: "Schema.Number",
    Number: "Schema.Number",
    boolean: "Schema.Boolean",
    Boolean: "Schema.Boolean",
    Date: "Schema.String",
    date: "Schema.String",
    object: "Schema.Struct({})",
    any: "Schema.Unknown",
    unknown: "Schema.Unknown",
  },
};

/**
 * Get the default suggestion for an unknown scalar value
 */
function getDefaultSuggestion(validator: ValidatorLibrary): string {
  switch (validator) {
    case "zod":
      return "z.string()";
    case "valibot":
      return "v.string()";
    case "arktype":
      return 'type("string")';
    case "effect":
      return "Schema.String";
  }
}

/**
 * Validate that a custom scalar value is a valid validator expression.
 * Returns an error message if invalid, undefined if valid.
 */
function validateScalarCode(
  scalarName: string,
  code: string,
  validator: ValidatorLibrary,
): string | undefined {
  const prefixes = validatorPrefixes[validator];
  const looksValid = prefixes.some((prefix) => code.startsWith(prefix));

  if (!looksValid) {
    const suggestion =
      scalarSuggestions[validator][code] ?? getDefaultSuggestion(validator);
    return (
      `Invalid scalar mapping for "${scalarName}": received "${code}". ` +
      `For ${validator}, scalar values must be valid ${validator} expressions. ` +
      `Did you mean "${suggestion}"?`
    );
  }
  return undefined;
}

// ============================================================================
// Options & Context
// ============================================================================

/**
 * Options for GraphQL IR parsing
 */
export interface GraphQLIROptions {
  /**
   * Custom scalar to code mappings.
   * The values are validator-specific code strings that will be emitted verbatim.
   * e.g., { DateTime: "z.string()" } for Zod
   */
  scalars?: Record<string, string>;
  /**
   * The validator library being used.
   * Used to validate that custom scalar values are valid expressions for the target library.
   */
  validator?: ValidatorLibrary;
}

/**
 * Context for GraphQL IR generation
 */
interface GraphQLIRContext {
  /** GraphQL schema for type lookups */
  schema: GraphQLSchema;
  /** Default scalar IR mappings */
  scalarMappings: Record<string, SchemaIR>;
  /** Custom scalar code mappings (validator-specific, emitted as raw) */
  customScalars: Record<string, string>;
  /** The validator library being used (for scalar validation) */
  validator?: ValidatorLibrary;
  /** Track generated schema names to avoid duplicates */
  generatedSchemas: Set<string>;
  /** Track schemas that need to be generated (dependencies) */
  pendingSchemas: Map<string, GraphQLInputObjectType | GraphQLEnumType>;
  /** Types that have been visited (to avoid infinite recursion) */
  visited: Set<string>;
  /** Generated named schemas */
  schemas: NamedSchemaIR[];
  /** All parsed fragments for lookup during response generation */
  fragments: ParsedFragment[];
  /** Fragment schemas that have been generated (for spreading) */
  generatedFragmentSchemas: Set<string>;
  /** Warnings during generation */
  warnings: string[];
}

function createContext(
  schema: GraphQLSchema,
  fragments: ParsedFragment[],
  options: GraphQLIROptions,
): GraphQLIRContext {
  return {
    schema,
    scalarMappings: { ...defaultScalarToIR },
    customScalars: options.scalars ?? {},
    validator: options.validator,
    generatedSchemas: new Set(),
    pendingSchemas: new Map(),
    visited: new Set(),
    schemas: [],
    fragments,
    generatedFragmentSchemas: new Set(),
    warnings: [],
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Parse GraphQL schema and documents to IR
 */
export function parseGraphQLToIR(
  schema: GraphQLSchema,
  documents: ParsedDocuments,
  options: GraphQLIROptions = {},
): SchemaIRResult {
  const ctx = createContext(schema, documents.fragments, options);
  const { operations, fragments } = documents;

  // 1. Collect and generate all enums referenced by operations (both inputs and outputs)
  collectAndGenerateEnums(operations, fragments, ctx);

  // 2. Collect and generate input types used by operation variables
  const inputTypes = collectInputTypesFromOperations(operations, schema, ctx);
  for (const inputType of inputTypes) {
    generateInputTypeSchema(inputType, ctx);
  }

  // 3. Process any pending schemas (enum/input dependencies)
  processPendingSchemas(ctx);

  // 4. Generate fragment schemas
  for (const fragment of fragments) {
    generateFragmentSchema(fragment, ctx);
  }

  // 5. Generate operation variable schemas
  generateOperationVariablesSchemas(operations, ctx);

  // 6. Generate operation response schemas
  generateOperationResponseSchemas(operations, ctx);

  // Sort schemas topologically
  const sortedSchemas = topologicalSortSchemas(ctx.schemas);

  return {
    schemas: sortedSchemas,
    warnings: ctx.warnings,
  };
}

// ============================================================================
// Enum Collection and Generation
// ============================================================================

/**
 * Collect and generate all enums referenced by operations (both inputs and outputs)
 */
function collectAndGenerateEnums(
  operations: ParsedOperation[],
  fragments: ParsedFragment[],
  ctx: GraphQLIRContext,
): void {
  const enumTypes = new Set<GraphQLEnumType>();

  // Collect enums from operation variables (inputs)
  for (const operation of operations) {
    const variables = operation.node.variableDefinitions ?? [];
    for (const varDef of variables) {
      collectEnumsFromTypeNode(varDef.type, ctx, enumTypes);
    }
  }

  // Collect enums from operation selection sets (outputs)
  for (const operation of operations) {
    const rootType =
      operation.operation === "query"
        ? ctx.schema.getQueryType()
        : ctx.schema.getMutationType();

    if (rootType && operation.node.selectionSet) {
      collectEnumsFromSelectionSet(
        operation.node.selectionSet,
        rootType,
        ctx,
        enumTypes,
      );
    }
  }

  // Collect enums from fragment selection sets
  for (const fragment of fragments) {
    const parentType = ctx.schema.getType(fragment.typeName);
    if (
      parentType &&
      (isObjectType(parentType) || isInterfaceType(parentType))
    ) {
      collectEnumsFromSelectionSet(
        fragment.node.selectionSet,
        parentType,
        ctx,
        enumTypes,
      );
    }
  }

  // Generate schemas for all collected enums
  for (const enumType of enumTypes) {
    generateEnumSchema(enumType, ctx);
  }
}

/**
 * Collect enums from a GraphQL AST type node
 */
function collectEnumsFromTypeNode(
  typeNode: { kind: string; type?: unknown; name?: { value: string } },
  ctx: GraphQLIRContext,
  enumTypes: Set<GraphQLEnumType>,
): void {
  if (
    (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") &&
    typeNode.type
  ) {
    collectEnumsFromTypeNode(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      ctx,
      enumTypes,
    );
    return;
  }

  if (typeNode.kind === "NamedType" && typeNode.name?.value) {
    const typeName = typeNode.name.value;
    const schemaType = ctx.schema.getType(typeName);

    if (isEnumType(schemaType)) {
      enumTypes.add(schemaType);
    } else if (isInputObjectType(schemaType)) {
      // Recursively collect enums from input object fields
      const fields = schemaType.getFields();
      for (const field of Object.values(fields)) {
        collectEnumsFromGraphQLInputType(field.type, ctx, enumTypes);
      }
    }
  }
}

/**
 * Collect enums from a GraphQL input type
 */
function collectEnumsFromGraphQLInputType(
  type: GraphQLInputType,
  ctx: GraphQLIRContext,
  enumTypes: Set<GraphQLEnumType>,
): void {
  if (isNonNullType(type) || isListType(type)) {
    collectEnumsFromGraphQLInputType(type.ofType, ctx, enumTypes);
    return;
  }

  if (isEnumType(type)) {
    enumTypes.add(type);
  } else if (isInputObjectType(type)) {
    const fields = type.getFields();
    for (const field of Object.values(fields)) {
      collectEnumsFromGraphQLInputType(field.type, ctx, enumTypes);
    }
  }
}

/**
 * Collect enums from a selection set (for output types)
 */
function collectEnumsFromSelectionSet(
  selectionSet: { selections: readonly unknown[] },
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GraphQLIRContext,
  enumTypes: Set<GraphQLEnumType>,
): void {
  const parentFields = parentType.getFields();

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      name?: { value: string };
      selectionSet?: { selections: readonly unknown[] };
      typeCondition?: { name: { value: string } };
    };

    if (sel.kind === "Field") {
      const fieldName = sel.name?.value;
      if (!fieldName || fieldName === "__typename") continue;

      const schemaField = parentFields[fieldName];
      if (!schemaField) continue;

      collectEnumsFromOutputType(
        schemaField.type,
        sel.selectionSet,
        ctx,
        enumTypes,
      );
    }

    if (sel.kind === "FragmentSpread") {
      const fragmentName = sel.name?.value;
      const fragment = ctx.fragments.find((f) => f.name === fragmentName);
      if (fragment) {
        const fragmentType = ctx.schema.getType(fragment.typeName);
        if (
          fragmentType &&
          (isObjectType(fragmentType) || isInterfaceType(fragmentType))
        ) {
          collectEnumsFromSelectionSet(
            fragment.node.selectionSet,
            fragmentType,
            ctx,
            enumTypes,
          );
        }
      }
    }

    if (
      sel.kind === "InlineFragment" &&
      sel.typeCondition &&
      sel.selectionSet
    ) {
      const typeName = sel.typeCondition.name.value;
      const fragmentType = ctx.schema.getType(typeName);
      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        collectEnumsFromSelectionSet(
          sel.selectionSet,
          fragmentType,
          ctx,
          enumTypes,
        );
      }
    }
  }
}

/**
 * Collect enums from a GraphQL output type
 */
function collectEnumsFromOutputType(
  type: GraphQLOutputType,
  selectionSet: { selections: readonly unknown[] } | undefined,
  ctx: GraphQLIRContext,
  enumTypes: Set<GraphQLEnumType>,
): void {
  if (isNonNullType(type) || isListType(type)) {
    collectEnumsFromOutputType(type.ofType, selectionSet, ctx, enumTypes);
    return;
  }

  if (isEnumType(type)) {
    enumTypes.add(type);
    return;
  }

  if ((isObjectType(type) || isInterfaceType(type)) && selectionSet) {
    collectEnumsFromSelectionSet(selectionSet, type, ctx, enumTypes);
  }

  if (isUnionType(type) && selectionSet) {
    // For unions, we need to look at inline fragments
    for (const selection of selectionSet.selections) {
      const sel = selection as {
        kind: string;
        typeCondition?: { name: { value: string } };
        selectionSet?: { selections: readonly unknown[] };
      };

      if (
        sel.kind === "InlineFragment" &&
        sel.typeCondition &&
        sel.selectionSet
      ) {
        const typeName = sel.typeCondition.name.value;
        const fragmentType = ctx.schema.getType(typeName);
        if (
          fragmentType &&
          (isObjectType(fragmentType) || isInterfaceType(fragmentType))
        ) {
          collectEnumsFromSelectionSet(
            sel.selectionSet,
            fragmentType,
            ctx,
            enumTypes,
          );
        }
      }
    }
  }
}

// ============================================================================
// Input Type Collection and Generation
// ============================================================================

/**
 * Collect all input types used by operation variables
 */
function collectInputTypesFromOperations(
  operations: ParsedOperation[],
  schema: GraphQLSchema,
  ctx: GraphQLIRContext,
): GraphQLInputObjectType[] {
  const inputTypes: GraphQLInputObjectType[] = [];
  const collected = new Set<string>();

  for (const operation of operations) {
    const variables = operation.node.variableDefinitions ?? [];

    for (const varDef of variables) {
      collectInputTypesFromTypeNode(
        varDef.type,
        schema,
        inputTypes,
        collected,
        ctx,
      );
    }
  }

  return inputTypes;
}

/**
 * Collect input types from a GraphQL type node (AST)
 */
function collectInputTypesFromTypeNode(
  typeNode: { kind: string; type?: unknown; name?: { value: string } },
  schema: GraphQLSchema,
  inputTypes: GraphQLInputObjectType[],
  collected: Set<string>,
  ctx: GraphQLIRContext,
): void {
  if (
    (typeNode.kind === "NonNullType" || typeNode.kind === "ListType") &&
    typeNode.type
  ) {
    collectInputTypesFromTypeNode(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      schema,
      inputTypes,
      collected,
      ctx,
    );
    return;
  }

  if (typeNode.kind === "NamedType" && typeNode.name?.value) {
    const typeName = typeNode.name.value;
    const schemaType = schema.getType(typeName);

    if (!schemaType) {
      ctx.warnings.push(`Unknown type "${typeName}" referenced in variables`);
      return;
    }

    if (isInputObjectType(schemaType) && !collected.has(typeName)) {
      collected.add(typeName);
      inputTypes.push(schemaType);
      collectNestedInputTypes(schemaType, schema, inputTypes, collected, ctx);
    }
  }
}

/**
 * Recursively collect nested input types from an input object type
 */
function collectNestedInputTypes(
  inputType: GraphQLInputObjectType,
  schema: GraphQLSchema,
  inputTypes: GraphQLInputObjectType[],
  collected: Set<string>,
  ctx: GraphQLIRContext,
): void {
  const fields = inputType.getFields();

  for (const field of Object.values(fields)) {
    collectInputTypesFromGraphQLType(
      field.type,
      schema,
      inputTypes,
      collected,
      ctx,
    );
  }
}

/**
 * Collect input types from a GraphQL type (runtime type, not AST)
 */
function collectInputTypesFromGraphQLType(
  type: GraphQLInputType,
  schema: GraphQLSchema,
  inputTypes: GraphQLInputObjectType[],
  collected: Set<string>,
  ctx: GraphQLIRContext,
): void {
  if (isNonNullType(type) || isListType(type)) {
    collectInputTypesFromGraphQLType(
      type.ofType,
      schema,
      inputTypes,
      collected,
      ctx,
    );
    return;
  }

  if (isInputObjectType(type) && !collected.has(type.name)) {
    collected.add(type.name);
    inputTypes.push(type);
    collectNestedInputTypes(type, schema, inputTypes, collected, ctx);
  }
}

// ============================================================================
// Schema Generation
// ============================================================================

/**
 * Generate IR for a GraphQL enum type
 */
function generateEnumSchema(
  enumType: GraphQLEnumType,
  ctx: GraphQLIRContext,
): void {
  const typeName = enumType.name;

  if (ctx.generatedSchemas.has(typeName)) return;

  ctx.generatedSchemas.add(typeName);

  const values = enumType.getValues();
  const enumValues = values.map((v) => v.name);
  const ir: SchemaIR = { kind: "enum", values: enumValues };

  ctx.schemas.push(createNamedSchema(typeName, ir, "enum"));
}

/**
 * Generate IR for a GraphQL input object type
 */
function generateInputTypeSchema(
  inputType: GraphQLInputObjectType,
  ctx: GraphQLIRContext,
): void {
  const typeName = inputType.name;

  if (ctx.generatedSchemas.has(typeName)) return;
  if (ctx.visited.has(typeName)) return;

  ctx.visited.add(typeName);
  ctx.generatedSchemas.add(typeName);

  const fields = inputType.getFields();
  const properties: Record<string, ObjectPropertyIR> = {};

  // Note: We store the original field name in the IR. The emitter is responsible
  // for applying getSafePropertyName() at code generation time.
  for (const field of Object.values(fields)) {
    const ir = graphqlInputTypeToIR(field.type, ctx);
    const isRequired = isNonNullType(field.type);

    properties[field.name] = {
      schema: ir,
      required: isRequired,
    };
  }

  const objectIR: SchemaIR = { kind: "object", properties };
  ctx.schemas.push(createNamedSchema(typeName, objectIR, "input"));
}

/**
 * Process any pending schemas that were discovered as dependencies
 */
function processPendingSchemas(ctx: GraphQLIRContext): void {
  while (ctx.pendingSchemas.size > 0) {
    const entries = [...ctx.pendingSchemas.entries()];
    ctx.pendingSchemas.clear();

    for (const [name, type] of entries) {
      if (!ctx.generatedSchemas.has(name)) {
        if (isInputObjectType(type)) {
          generateInputTypeSchema(type, ctx);
        } else if (isEnumType(type)) {
          generateEnumSchema(type, ctx);
        }
      }
    }
  }
}

/**
 * Convert a GraphQL input type to IR
 */
function graphqlInputTypeToIR(
  type: GraphQLInputType,
  ctx: GraphQLIRContext,
  isTopLevel = true,
): SchemaIR {
  // Check if this type is non-null
  const isRequired = isNonNullType(type);
  const innerType = isRequired ? type.ofType : type;

  // Generate the base IR
  let ir: SchemaIR;

  if (isListType(innerType)) {
    // For arrays, recursively process the item type (not top-level)
    const itemIR = graphqlInputTypeToIR(innerType.ofType, ctx, false);
    ir = { kind: "array", items: itemIR };
  } else if (isScalarType(innerType)) {
    ir = getScalarIR(innerType.name, ctx);
  } else if (isEnumType(innerType)) {
    if (
      !ctx.generatedSchemas.has(innerType.name) &&
      !ctx.pendingSchemas.has(innerType.name)
    ) {
      ctx.pendingSchemas.set(innerType.name, innerType);
    }
    ir = { kind: "ref", name: innerType.name };
  } else if (isInputObjectType(innerType)) {
    if (
      !ctx.generatedSchemas.has(innerType.name) &&
      !ctx.pendingSchemas.has(innerType.name)
    ) {
      ctx.pendingSchemas.set(innerType.name, innerType);
    }
    ir = { kind: "ref", name: innerType.name };
  } else {
    ctx.warnings.push("Unsupported GraphQL input type");
    ir = { kind: "unknown" };
  }

  // For non-top-level types (e.g., array items), add nullish if not required
  if (!isTopLevel && !isRequired) {
    ir = {
      kind: "union",
      members: [ir, { kind: "null" }, { kind: "undefined" }],
    };
  }

  return ir;
}

/**
 * Get IR for a scalar type
 */
function getScalarIR(scalarName: string, ctx: GraphQLIRContext): SchemaIR {
  // Check for custom scalar mapping first (validator-specific)
  if (ctx.customScalars[scalarName]) {
    const code = ctx.customScalars[scalarName];

    // Validate the scalar code if validator is specified
    if (ctx.validator) {
      const error = validateScalarCode(scalarName, code, ctx.validator);
      if (error) {
        throw new Error(error);
      }
    }

    return { kind: "raw", code };
  }

  // Check default mappings
  const mapped = ctx.scalarMappings[scalarName];
  if (mapped) {
    return mapped;
  }

  // Unknown scalar - warn and use unknown
  ctx.warnings.push(
    `Unknown scalar type "${scalarName}", using unknown. Consider adding a scalar mapping.`,
  );
  return { kind: "unknown" };
}

// ============================================================================
// Fragment Schema Generation
// ============================================================================

/**
 * Generate IR for a GraphQL fragment
 */
function generateFragmentSchema(
  fragment: ParsedFragment,
  ctx: GraphQLIRContext,
): void {
  const typeName = toFragmentTypeName(fragment.name);

  if (ctx.generatedSchemas.has(typeName)) return;

  const parentType = ctx.schema.getType(fragment.typeName);
  if (
    !parentType ||
    (!isObjectType(parentType) && !isInterfaceType(parentType))
  ) {
    ctx.warnings.push(
      `Unable to resolve type "${fragment.typeName}" for fragment "${fragment.name}"`,
    );
    return;
  }

  const ir = generateSelectionSetIR(
    fragment.node.selectionSet,
    parentType,
    ctx,
  );

  // Mark this fragment as generated so we can reference it
  ctx.generatedFragmentSchemas.add(fragment.name);
  ctx.generatedSchemas.add(typeName);
  ctx.schemas.push(createNamedSchema(typeName, ir, "fragment"));
}

// ============================================================================
// Operation Variable Schema Generation
// ============================================================================

/**
 * Generate IR for operation variables
 */
function generateOperationVariablesSchemas(
  operations: ParsedOperation[],
  ctx: GraphQLIRContext,
): void {
  for (const operation of operations) {
    const variables = operation.node.variableDefinitions ?? [];
    if (variables.length === 0) continue;

    const typeName =
      operation.operation === "query"
        ? toQueryVariablesTypeName(operation.name)
        : toMutationVariablesTypeName(operation.name);

    if (ctx.generatedSchemas.has(typeName)) continue;

    const properties: Record<string, ObjectPropertyIR> = {};

    for (const varDef of variables) {
      const varName = varDef.variable.name.value;
      const ir = astTypeToIR(varDef.type, ctx);
      const isRequired = varDef.type.kind === "NonNullType";

      properties[varName] = {
        schema: ir,
        required: isRequired,
      };
    }

    const objectIR: SchemaIR = { kind: "object", properties };
    ctx.generatedSchemas.add(typeName);
    ctx.schemas.push(createNamedSchema(typeName, objectIR, "variables"));
  }
}

/**
 * Convert a GraphQL AST type node to IR
 */
function astTypeToIR(
  typeNode: { kind: string; type?: unknown; name?: { value: string } },
  ctx: GraphQLIRContext,
): SchemaIR {
  if (typeNode.kind === "NonNullType" && typeNode.type) {
    return astTypeToIR(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      ctx,
    );
  }

  if (typeNode.kind === "ListType" && typeNode.type) {
    const innerIR = astTypeToIR(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      ctx,
    );
    return {
      kind: "union",
      members: [{ kind: "array", items: innerIR }, { kind: "null" }],
    };
  }

  if (typeNode.kind === "NamedType" && typeNode.name?.value) {
    const typeName = typeNode.name.value;
    const schemaType = ctx.schema.getType(typeName);

    if (!schemaType) {
      ctx.warnings.push(`Unknown type "${typeName}" in operation variables`);
      return { kind: "unknown" };
    }

    if (isScalarType(schemaType)) {
      return getScalarIR(typeName, ctx);
    }

    // Enums and input types - reference the schema
    return { kind: "ref", name: typeName };
  }

  return { kind: "unknown" };
}

// ============================================================================
// Operation Response Schema Generation
// ============================================================================

/**
 * Generate IR for operation responses
 */
function generateOperationResponseSchemas(
  operations: ParsedOperation[],
  ctx: GraphQLIRContext,
): void {
  for (const operation of operations) {
    const typeName =
      operation.operation === "query"
        ? toQueryResponseTypeName(operation.name)
        : toMutationResponseTypeName(operation.name);

    if (ctx.generatedSchemas.has(typeName)) continue;

    const rootType =
      operation.operation === "query"
        ? ctx.schema.getQueryType()
        : ctx.schema.getMutationType();

    if (!rootType) {
      ctx.warnings.push(
        `No ${operation.operation} type in schema for operation "${operation.name}"`,
      );
      continue;
    }

    const ir = generateSelectionSetIR(
      operation.node.selectionSet,
      rootType,
      ctx,
    );

    ctx.generatedSchemas.add(typeName);
    ctx.schemas.push(createNamedSchema(typeName, ir, "response"));
  }
}

// ============================================================================
// Selection Set to IR Conversion
// ============================================================================

interface SelectionFieldResult {
  properties: Record<string, ObjectPropertyIR>;
  spreadFragments: string[];
}

/**
 * Generate IR from a GraphQL selection set
 */
function generateSelectionSetIR(
  selectionSet: { selections: readonly unknown[] },
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GraphQLIRContext,
): SchemaIR {
  const result = extractSelectionFields(selectionSet, parentType, ctx);

  // Build object properties
  const allProperties = { ...result.properties };

  // For fragment spreads, we need to merge their properties
  // In the emitters, we'll handle this with spread syntax
  // For now, we just create a reference that emitters can handle

  // If there are fragment spreads, the emitter needs to know about them
  // We'll store this information in the schema for the emitter to use
  if (result.spreadFragments.length > 0) {
    // Create an object schema that includes fragment references
    // The emitter will handle the spreading syntax
    const objectIR: SchemaIR & { _fragmentSpreads?: string[] } = {
      kind: "object",
      properties: allProperties,
    };
    // Store fragment spreads as metadata for emitters
    (objectIR as { _fragmentSpreads?: string[] })._fragmentSpreads =
      result.spreadFragments;

    return objectIR;
  }

  return { kind: "object", properties: allProperties };
}

/**
 * Extract field definitions from a selection set
 */
function extractSelectionFields(
  selectionSet: { selections: readonly unknown[] },
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GraphQLIRContext,
): SelectionFieldResult {
  const properties: Record<string, ObjectPropertyIR> = {};
  const spreadFragments: string[] = [];
  const parentFields = parentType.getFields();

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      name?: { value: string };
      alias?: { value: string };
      selectionSet?: { selections: readonly unknown[] };
      typeCondition?: { name: { value: string } };
    };

    if (sel.kind === "Field") {
      const fieldName = sel.name?.value;
      const outputName = sel.alias?.value ?? fieldName;
      if (!fieldName || !outputName) continue;

      // Handle __typename
      if (fieldName === "__typename") {
        properties[outputName] = {
          schema: { kind: "literal", value: parentType.name },
          required: true,
        };
        continue;
      }

      const schemaField = parentFields[fieldName];
      if (!schemaField) continue;

      const fieldType = schemaField.type;
      const ir = generateOutputTypeIR(fieldType, sel.selectionSet, ctx);
      const isRequired = isNonNullType(fieldType);

      properties[outputName] = {
        schema: ir,
        required: isRequired,
      };
    }

    if (sel.kind === "FragmentSpread") {
      const fragmentName = sel.name?.value;
      if (fragmentName && ctx.generatedFragmentSchemas.has(fragmentName)) {
        spreadFragments.push(fragmentName);
      } else if (fragmentName) {
        // Fragment not yet generated, inline it
        const fragment = ctx.fragments.find((f) => f.name === fragmentName);
        if (fragment) {
          const fragmentType = ctx.schema.getType(fragment.typeName);
          if (
            fragmentType &&
            (isObjectType(fragmentType) || isInterfaceType(fragmentType))
          ) {
            const fragmentResult = extractSelectionFields(
              fragment.node.selectionSet,
              fragmentType,
              ctx,
            );
            Object.assign(properties, fragmentResult.properties);
            spreadFragments.push(...fragmentResult.spreadFragments);
          }
        }
      }
    }

    if (sel.kind === "InlineFragment" && sel.selectionSet) {
      const typeName = sel.typeCondition?.name.value ?? parentType.name;
      const fragmentType = ctx.schema.getType(typeName);

      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        const inlineResult = extractSelectionFields(
          sel.selectionSet,
          fragmentType,
          ctx,
        );
        Object.assign(properties, inlineResult.properties);
        spreadFragments.push(...inlineResult.spreadFragments);
      }
    }
  }

  return { properties, spreadFragments };
}

/**
 * Generate IR for a GraphQL output type
 */
function generateOutputTypeIR(
  type: GraphQLOutputType,
  selectionSet: { selections: readonly unknown[] } | undefined,
  ctx: GraphQLIRContext,
): SchemaIR {
  // Unwrap NonNull
  if (isNonNullType(type)) {
    return generateOutputTypeIR(type.ofType, selectionSet, ctx);
  }

  // Handle lists
  if (isListType(type)) {
    const innerIR = generateOutputTypeIR(type.ofType, selectionSet, ctx);
    return { kind: "array", items: innerIR };
  }

  // Handle scalars
  if (isScalarType(type)) {
    return getScalarIR(type.name, ctx);
  }

  // Handle enums
  if (isEnumType(type)) {
    return { kind: "ref", name: type.name };
  }

  // Handle union types
  if (isUnionType(type) && selectionSet) {
    return generateUnionTypeIR(type, selectionSet, ctx);
  }

  // Handle interface types
  if (isInterfaceType(type) && selectionSet) {
    return generateInterfaceTypeIR(type, selectionSet, ctx);
  }

  // Handle object types with nested selections
  if (isObjectType(type) && selectionSet) {
    return generateSelectionSetIR(selectionSet, type, ctx);
  }

  return { kind: "unknown" };
}

/**
 * Generate IR for a GraphQL union type
 */
function generateUnionTypeIR(
  type: GraphQLUnionType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GraphQLIRContext,
): SchemaIR {
  const members: SchemaIR[] = [];

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      typeCondition?: { name: { value: string } };
      selectionSet?: { selections: readonly unknown[] };
    };

    if (
      sel.kind === "InlineFragment" &&
      sel.typeCondition &&
      sel.selectionSet
    ) {
      const typeName = sel.typeCondition.name.value;
      const fragmentType = ctx.schema.getType(typeName);

      if (fragmentType && isObjectType(fragmentType)) {
        const memberIR = generateSelectionSetIR(
          sel.selectionSet,
          fragmentType,
          ctx,
        );
        members.push(memberIR);
      }
    }
  }

  if (members.length === 0) {
    ctx.warnings.push(
      `Union type "${type.name}" has no inline fragments. Consider adding "... on TypeName { fields }" to select specific fields.`,
    );
    return { kind: "unknown" };
  }

  if (members.length === 1 && members[0]) {
    return members[0];
  }

  return { kind: "union", members };
}

/**
 * Generate IR for a GraphQL interface type
 */
function generateInterfaceTypeIR(
  type: GraphQLInterfaceType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GraphQLIRContext,
): SchemaIR {
  const result = extractSelectionFields(selectionSet, type, ctx);
  const inlineFragments: SchemaIR[] = [];

  for (const selection of selectionSet.selections) {
    const sel = selection as {
      kind: string;
      typeCondition?: { name: { value: string } };
      selectionSet?: { selections: readonly unknown[] };
    };

    if (
      sel.kind === "InlineFragment" &&
      sel.typeCondition &&
      sel.selectionSet
    ) {
      const typeName = sel.typeCondition.name.value;
      const fragmentType = ctx.schema.getType(typeName);

      if (
        fragmentType &&
        (isObjectType(fragmentType) || isInterfaceType(fragmentType))
      ) {
        const memberIR = generateSelectionSetIR(
          sel.selectionSet,
          fragmentType,
          ctx,
        );
        inlineFragments.push(memberIR);
      }
    }
  }

  // If no inline fragments, return the common fields
  if (inlineFragments.length === 0) {
    if (result.spreadFragments.length > 0) {
      const objectIR: SchemaIR & { _fragmentSpreads?: string[] } = {
        kind: "object",
        properties: result.properties,
      };
      (objectIR as { _fragmentSpreads?: string[] })._fragmentSpreads =
        result.spreadFragments;
      return objectIR;
    }
    return { kind: "object", properties: result.properties };
  }

  // With inline fragments, create a union
  if (inlineFragments.length === 1 && inlineFragments[0]) {
    return inlineFragments[0];
  }

  return { kind: "union", members: inlineFragments };
}
