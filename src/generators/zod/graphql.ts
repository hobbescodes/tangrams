/**
 * GraphQL to Zod schema generation
 * Converts GraphQL input types and enums to Zod validation schemas
 */

import {
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isScalarType,
} from "graphql";

import {
  addSchemaToContext,
  buildZodOutput,
  createZodGenContext,
  getSafePropertyName,
  toSchemaName,
} from "./index";

import type {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInputType,
  GraphQLSchema,
} from "graphql";
import type { ParsedDocuments } from "@/core/documents";
import type { ZodGenContext } from "./index";

/**
 * Default scalar mappings from GraphQL to Zod
 */
const defaultScalarToZod: Record<string, string> = {
  ID: "z.string()",
  String: "z.string()",
  Int: "z.number().int()",
  Float: "z.number()",
  Boolean: "z.boolean()",
  DateTime: "z.iso.datetime()",
  Date: "z.iso.date()",
  Time: "z.iso.time()",
  JSON: "z.unknown()",
  JSONObject: "z.record(z.string(), z.unknown())",
  BigInt: "z.bigint()",
  UUID: "z.uuid()",
};

/**
 * Extended context for GraphQL Zod generation
 */
interface GraphQLZodContext extends ZodGenContext {
  /** GraphQL schema for type lookups */
  schema: GraphQLSchema;
  /** Scalar to Zod mappings */
  scalarMappings: Record<string, string>;
  /** Types that have been visited (to avoid infinite recursion) */
  visited: Set<string>;
}

/**
 * Options for GraphQL Zod generation
 */
export interface GraphQLZodOptions {
  /** Custom scalar to Zod mappings (e.g., { DateTime: "z.string()" }) */
  scalars?: Record<string, string>;
  /** Only generate schemas for mutations (for form usage) */
  mutationsOnly?: boolean;
}

/**
 * Result of GraphQL Zod generation
 */
export interface GraphQLZodResult {
  /** Generated code content */
  content: string;
  /** Warnings during generation */
  warnings: string[];
}

/**
 * Generate Zod schemas from GraphQL schema and documents
 * Generates schemas for input types used by mutations (variables)
 */
export function generateGraphQLZodSchemas(
  schema: GraphQLSchema,
  documents: ParsedDocuments,
  options: GraphQLZodOptions = {},
): GraphQLZodResult {
  const ctx: GraphQLZodContext = {
    ...createZodGenContext(),
    schema,
    scalarMappings: {
      ...defaultScalarToZod,
      ...options.scalars,
    },
    visited: new Set(),
  };

  // Filter to mutations if requested
  const operations = options.mutationsOnly
    ? documents.operations.filter((op) => op.operation === "mutation")
    : documents.operations;

  // Collect all input types used by operation variables
  const inputTypes = collectInputTypesFromOperations(operations, schema, ctx);

  // Generate Zod schemas for collected input types (in dependency order)
  for (const inputType of inputTypes) {
    generateInputTypeSchema(inputType, ctx);
  }

  // Process any pending schemas (dependencies)
  processPendingSchemas(ctx);

  return {
    content: buildZodOutput(ctx),
    warnings: ctx.warnings,
  };
}

/**
 * Collect all input types used by operation variables
 */
function collectInputTypesFromOperations(
  operations: ParsedDocuments["operations"],
  schema: GraphQLSchema,
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
): void {
  // Unwrap NonNull and List
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

  // Get the named type
  if (typeNode.kind === "NamedType" && typeNode.name?.value) {
    const typeName = typeNode.name.value;
    const schemaType = schema.getType(typeName);

    if (!schemaType) {
      ctx.warnings.push(`Unknown type "${typeName}" referenced in variables`);
      return;
    }

    // Collect input object types
    if (isInputObjectType(schemaType) && !collected.has(typeName)) {
      collected.add(typeName);
      inputTypes.push(schemaType);

      // Recursively collect nested input types
      collectNestedInputTypes(schemaType, schema, inputTypes, collected, ctx);
    }

    // Enums are collected during schema generation
    if (isEnumType(schemaType) && !collected.has(typeName)) {
      collected.add(typeName);
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
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
): void {
  // Unwrap NonNull and List
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

  // Collect input object types
  if (isInputObjectType(type) && !collected.has(type.name)) {
    collected.add(type.name);
    inputTypes.push(type);

    // Recursively collect nested input types
    collectNestedInputTypes(type, schema, inputTypes, collected, ctx);
  }
}

/**
 * Generate a Zod schema for a GraphQL input object type
 */
function generateInputTypeSchema(
  inputType: GraphQLInputObjectType,
  ctx: GraphQLZodContext,
): void {
  const typeName = inputType.name;

  if (ctx.generatedSchemas.has(typeName)) return;
  if (ctx.visited.has(typeName)) return;

  ctx.visited.add(typeName);

  const fields = inputType.getFields();
  const fieldDefs: string[] = [];

  for (const field of Object.values(fields)) {
    const zodType = graphqlTypeToZod(field.type, ctx);
    const isRequired = isNonNullType(field.type);
    const safeName = getSafePropertyName(field.name);

    if (isRequired) {
      fieldDefs.push(`  ${safeName}: ${zodType}`);
    } else {
      fieldDefs.push(`  ${safeName}: ${zodType}.optional()`);
    }
  }

  const zodSchema = `z.object({\n${fieldDefs.join(",\n")}\n})`;
  addSchemaToContext(ctx, typeName, zodSchema);
}

/**
 * Generate a Zod schema for a GraphQL enum type
 */
function generateEnumSchema(
  enumType: GraphQLEnumType,
  ctx: GraphQLZodContext,
): void {
  const typeName = enumType.name;

  if (ctx.generatedSchemas.has(typeName)) return;

  const values = enumType.getValues();
  const enumValues = values.map((v) => `"${v.name}"`).join(", ");
  const zodSchema = `z.enum([${enumValues}])`;

  addSchemaToContext(ctx, typeName, zodSchema);
}

/**
 * Process any pending schemas that were discovered as dependencies
 */
function processPendingSchemas(ctx: GraphQLZodContext): void {
  while (ctx.pendingSchemas.size > 0) {
    const entries = [...ctx.pendingSchemas.entries()];
    ctx.pendingSchemas.clear();

    for (const [name, type] of entries) {
      if (!ctx.generatedSchemas.has(name)) {
        if (isInputObjectType(type)) {
          generateInputTypeSchema(type as GraphQLInputObjectType, ctx);
        } else if (isEnumType(type)) {
          generateEnumSchema(type as GraphQLEnumType, ctx);
        }
      }
    }
  }
}

/**
 * Convert a GraphQL type to a Zod type string
 */
function graphqlTypeToZod(
  type: GraphQLInputType,
  ctx: GraphQLZodContext,
): string {
  // Handle NonNull wrapper
  if (isNonNullType(type)) {
    return graphqlTypeToZod(type.ofType, ctx);
  }

  // Handle List wrapper
  if (isListType(type)) {
    const innerType = graphqlTypeToZod(type.ofType, ctx);
    return `z.array(${innerType}).nullable()`;
  }

  // Handle scalars
  if (isScalarType(type)) {
    const zodType = ctx.scalarMappings[type.name];
    if (zodType) {
      return zodType;
    }
    ctx.warnings.push(
      `Unknown scalar type "${type.name}", using z.unknown(). Consider adding a scalar mapping.`,
    );
    return "z.unknown()";
  }

  // Handle enums
  if (isEnumType(type)) {
    // Queue enum for generation if not already generated
    if (
      !ctx.generatedSchemas.has(type.name) &&
      !ctx.pendingSchemas.has(type.name)
    ) {
      ctx.pendingSchemas.set(type.name, type);
    }
    return toSchemaName(type.name);
  }

  // Handle input object types
  if (isInputObjectType(type)) {
    // Queue input type for generation if not already generated
    if (
      !ctx.generatedSchemas.has(type.name) &&
      !ctx.pendingSchemas.has(type.name)
    ) {
      ctx.pendingSchemas.set(type.name, type);
    }
    return toSchemaName(type.name);
  }

  ctx.warnings.push("Unsupported GraphQL type");
  return "z.unknown()";
}
