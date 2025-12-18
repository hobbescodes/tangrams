/**
 * GraphQL to Zod schema generation
 * Converts GraphQL types to Zod validation schemas including:
 * - Enums
 * - Input types (for mutations)
 * - Fragment schemas
 * - Operation variable schemas
 * - Operation response schemas
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
  addSchemaToContext,
  buildZodOutput,
  createZodGenContext,
  getSafePropertyName,
  toFragmentSchemaName,
  toFragmentTypeName,
  toMutationResponseSchemaName,
  toMutationResponseTypeName,
  toMutationVariablesSchemaName,
  toMutationVariablesTypeName,
  toPascalCase,
  toQueryResponseSchemaName,
  toQueryResponseTypeName,
  toQueryVariablesSchemaName,
  toQueryVariablesTypeName,
  toSchemaName,
} from "./index";

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
  /** All parsed fragments for lookup during response generation */
  fragments: ParsedFragment[];
  /** Fragment schemas that have been generated (for spreading) */
  generatedFragmentSchemas: Set<string>;
}

/**
 * Options for GraphQL Zod generation
 */
export interface GraphQLZodOptions {
  /** Custom scalar to Zod mappings (e.g., { DateTime: "z.string()" }) */
  scalars?: Record<string, string>;
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
 * Generates schemas for:
 * - All enums referenced by operations (inputs and outputs)
 * - Input types used by mutations
 * - Fragment schemas
 * - Operation variable schemas
 * - Operation response schemas
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
    fragments: documents.fragments,
    generatedFragmentSchemas: new Set(),
  };

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

  return {
    content: buildZodOutput(ctx),
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
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
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
  ctx: GraphQLZodContext,
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
 * Generate a Zod schema for a GraphQL input object type
 *
 * Uses .nullish() for nullable fields to provide compatibility between
 * GraphQL input semantics (optional/undefined) and output semantics (nullable/null).
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
    const zodType = graphqlInputTypeToZod(field.type, ctx);
    const isRequired = isNonNullType(field.type);
    const safeName = getSafePropertyName(field.name);

    if (isRequired) {
      fieldDefs.push(`  ${safeName}: ${zodType}`);
    } else {
      // Use .nullish() for nullable fields to accept both null and undefined
      // This provides compatibility with output types that use null
      fieldDefs.push(`  ${safeName}: ${zodType}.nullish()`);
    }
  }

  const zodSchema = `z.object({\n${fieldDefs.join(",\n")}\n})`;
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
 * Convert a GraphQL input type to a Zod type string
 *
 * @param type - The GraphQL input type to convert
 * @param ctx - The generation context
 * @param isTopLevel - Whether this is a top-level field (nullability handled by caller)
 *
 * For top-level fields, nullability (.nullish()) is handled by generateInputTypeSchema.
 * For nested types (e.g., array items), we add .nullish() here when the type is not NonNull.
 */
function graphqlInputTypeToZod(
  type: GraphQLInputType,
  ctx: GraphQLZodContext,
  isTopLevel = true,
): string {
  // Check if this type is non-null
  const isRequired = isNonNullType(type);
  const innerType = isRequired ? type.ofType : type;

  // Generate the base Zod type
  let zodType: string;

  if (isListType(innerType)) {
    // For arrays, recursively process the item type (not top-level)
    const itemZodType = graphqlInputTypeToZod(innerType.ofType, ctx, false);
    zodType = `z.array(${itemZodType})`;
  } else if (isScalarType(innerType)) {
    const mapped = ctx.scalarMappings[innerType.name];
    if (mapped) {
      zodType = mapped;
    } else {
      ctx.warnings.push(
        `Unknown scalar type "${innerType.name}", using z.unknown(). Consider adding a scalar mapping.`,
      );
      zodType = "z.unknown()";
    }
  } else if (isEnumType(innerType)) {
    if (
      !ctx.generatedSchemas.has(innerType.name) &&
      !ctx.pendingSchemas.has(innerType.name)
    ) {
      ctx.pendingSchemas.set(innerType.name, innerType);
    }
    zodType = toSchemaName(innerType.name);
  } else if (isInputObjectType(innerType)) {
    if (
      !ctx.generatedSchemas.has(innerType.name) &&
      !ctx.pendingSchemas.has(innerType.name)
    ) {
      ctx.pendingSchemas.set(innerType.name, innerType);
    }
    zodType = toSchemaName(innerType.name);
  } else {
    ctx.warnings.push("Unsupported GraphQL input type");
    zodType = "z.unknown()";
  }

  // For non-top-level types (e.g., array items), add .nullish() if not required
  // This provides compatibility between input (undefined) and output (null) semantics
  if (!isTopLevel && !isRequired) {
    zodType = `${zodType}.nullish()`;
  }

  return zodType;
}

// ============================================================================
// Fragment Schema Generation
// ============================================================================

/**
 * Generate a Zod schema for a GraphQL fragment
 */
function generateFragmentSchema(
  fragment: ParsedFragment,
  ctx: GraphQLZodContext,
): void {
  const typeName = toFragmentTypeName(fragment.name);
  const schemaName = toFragmentSchemaName(fragment.name);

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

  const zodSchema = generateSelectionSetZodSchema(
    fragment.node.selectionSet,
    parentType,
    ctx,
  );

  // Mark this fragment as generated so we can spread it
  ctx.generatedFragmentSchemas.add(fragment.name);

  // Add to context with the Fragment type name (e.g., PetFieldsFragment)
  ctx.generatedSchemas.add(typeName);
  ctx.schemaEntries.set(typeName, {
    name: typeName,
    zodType: zodSchema,
    dependencies: extractDependenciesFromZodSchema(zodSchema),
  });
  ctx.typeExports.push(
    `export type ${typeName} = z.infer<typeof ${schemaName}>`,
  );
}

// ============================================================================
// Operation Variable Schema Generation
// ============================================================================

/**
 * Generate Zod schemas for operation variables
 *
 * Uses .nullish() for nullable variables to provide compatibility between
 * GraphQL input semantics (optional/undefined) and output semantics (nullable/null).
 */
function generateOperationVariablesSchemas(
  operations: ParsedOperation[],
  ctx: GraphQLZodContext,
): void {
  for (const operation of operations) {
    const variables = operation.node.variableDefinitions ?? [];
    if (variables.length === 0) continue;

    const typeName =
      operation.operation === "query"
        ? toQueryVariablesTypeName(operation.name)
        : toMutationVariablesTypeName(operation.name);

    const schemaName =
      operation.operation === "query"
        ? toQueryVariablesSchemaName(operation.name)
        : toMutationVariablesSchemaName(operation.name);

    if (ctx.generatedSchemas.has(typeName)) continue;

    const fieldDefs: string[] = [];

    for (const varDef of variables) {
      const varName = varDef.variable.name.value;
      const zodType = astTypeToZod(varDef.type, ctx);
      const isRequired = varDef.type.kind === "NonNullType";

      if (isRequired) {
        fieldDefs.push(`  ${varName}: ${zodType}`);
      } else {
        // Use .nullish() for nullable variables to accept both null and undefined
        fieldDefs.push(`  ${varName}: ${zodType}.nullish()`);
      }
    }

    const zodSchema = `z.object({\n${fieldDefs.join(",\n")}\n})`;

    ctx.generatedSchemas.add(typeName);
    ctx.schemaEntries.set(typeName, {
      name: typeName,
      zodType: zodSchema,
      dependencies: extractDependenciesFromZodSchema(zodSchema),
    });
    ctx.typeExports.push(
      `export type ${typeName} = z.infer<typeof ${schemaName}>`,
    );
  }
}

/**
 * Convert a GraphQL AST type node to a Zod type string
 */
function astTypeToZod(
  typeNode: { kind: string; type?: unknown; name?: { value: string } },
  ctx: GraphQLZodContext,
): string {
  if (typeNode.kind === "NonNullType" && typeNode.type) {
    return astTypeToZod(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      ctx,
    );
  }

  if (typeNode.kind === "ListType" && typeNode.type) {
    const innerType = astTypeToZod(
      typeNode.type as {
        kind: string;
        type?: unknown;
        name?: { value: string };
      },
      ctx,
    );
    return `z.array(${innerType}).nullable()`;
  }

  if (typeNode.kind === "NamedType" && typeNode.name?.value) {
    const typeName = typeNode.name.value;
    const schemaType = ctx.schema.getType(typeName);

    if (!schemaType) {
      ctx.warnings.push(`Unknown type "${typeName}" in operation variables`);
      return "z.unknown()";
    }

    if (isScalarType(schemaType)) {
      const zodType = ctx.scalarMappings[typeName];
      if (zodType) return zodType;
      ctx.warnings.push(
        `Unknown scalar type "${typeName}", using z.unknown(). Consider adding a scalar mapping.`,
      );
      return "z.unknown()";
    }

    // Enums and input types - reference the schema
    return toSchemaName(typeName);
  }

  return "z.unknown()";
}

// ============================================================================
// Operation Response Schema Generation
// ============================================================================

/**
 * Generate Zod schemas for operation responses
 */
function generateOperationResponseSchemas(
  operations: ParsedOperation[],
  ctx: GraphQLZodContext,
): void {
  for (const operation of operations) {
    const typeName =
      operation.operation === "query"
        ? toQueryResponseTypeName(operation.name)
        : toMutationResponseTypeName(operation.name);

    const schemaName =
      operation.operation === "query"
        ? toQueryResponseSchemaName(operation.name)
        : toMutationResponseSchemaName(operation.name);

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

    const zodSchema = generateSelectionSetZodSchema(
      operation.node.selectionSet,
      rootType,
      ctx,
    );

    ctx.generatedSchemas.add(typeName);
    ctx.schemaEntries.set(typeName, {
      name: typeName,
      zodType: zodSchema,
      dependencies: extractDependenciesFromZodSchema(zodSchema),
    });
    ctx.typeExports.push(
      `export type ${typeName} = z.infer<typeof ${schemaName}>`,
    );
  }
}

// ============================================================================
// Selection Set to Zod Schema Conversion
// ============================================================================

interface SelectionFieldResult {
  fields: string[];
  spreadFragments: string[];
}

/**
 * Generate a Zod schema from a GraphQL selection set
 */
function generateSelectionSetZodSchema(
  selectionSet: { selections: readonly unknown[] },
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GraphQLZodContext,
): string {
  const result = extractSelectionFields(selectionSet, parentType, ctx);

  // If there are fragment spreads, use Zod v4 spread pattern
  if (result.spreadFragments.length > 0) {
    const spreadParts = result.spreadFragments.map(
      (f) => `...${toFragmentSchemaName(f)}.shape`,
    );

    if (result.fields.length > 0) {
      // Combine fragment spreads with inline fields
      return `z.object({\n  ${spreadParts.join(",\n  ")},\n${result.fields.join(",\n")}\n})`;
    }
    // Only fragment spreads
    return `z.object({\n  ${spreadParts.join(",\n  ")}\n})`;
  }

  // No fragment spreads, just inline fields
  return `z.object({\n${result.fields.join(",\n")}\n})`;
}

/**
 * Extract field definitions from a selection set
 *
 * Uses .nullish() for nullable fields to provide compatibility between
 * GraphQL output semantics (nullable/null) and input semantics (optional/undefined).
 */
function extractSelectionFields(
  selectionSet: { selections: readonly unknown[] },
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  ctx: GraphQLZodContext,
): SelectionFieldResult {
  const fields: string[] = [];
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
        fields.push(`  ${outputName}: z.literal("${parentType.name}")`);
        continue;
      }

      const schemaField = parentFields[fieldName];
      if (!schemaField) continue;

      const fieldType = schemaField.type;
      const zodType = generateOutputTypeZodSchema(
        fieldType,
        sel.selectionSet,
        ctx,
      );
      const isRequired = isNonNullType(fieldType);

      if (isRequired) {
        fields.push(`  ${outputName}: ${zodType}`);
      } else {
        // Use .nullish() for nullable fields to accept both null and undefined
        // This provides compatibility with input types that use undefined
        fields.push(`  ${outputName}: ${zodType}.nullish()`);
      }
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
            fields.push(...fragmentResult.fields);
            spreadFragments.push(...fragmentResult.spreadFragments);
          }
        }
      }
    }

    if (sel.kind === "InlineFragment" && sel.selectionSet) {
      // For inline fragments without type condition, merge fields
      // For inline fragments with type condition, we'd need discriminated unions
      // For now, handle the simple case
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
        fields.push(...inlineResult.fields);
        spreadFragments.push(...inlineResult.spreadFragments);
      }
    }
  }

  return { fields, spreadFragments };
}

/**
 * Generate a Zod schema for a GraphQL output type
 */
function generateOutputTypeZodSchema(
  type: GraphQLOutputType,
  selectionSet: { selections: readonly unknown[] } | undefined,
  ctx: GraphQLZodContext,
): string {
  // Unwrap NonNull
  if (isNonNullType(type)) {
    return generateOutputTypeZodSchema(type.ofType, selectionSet, ctx);
  }

  // Handle lists
  if (isListType(type)) {
    const innerType = generateOutputTypeZodSchema(
      type.ofType,
      selectionSet,
      ctx,
    );
    return `z.array(${innerType})`;
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
    return toSchemaName(type.name);
  }

  // Handle union types
  if (isUnionType(type) && selectionSet) {
    return generateUnionTypeZodSchema(type, selectionSet, ctx);
  }

  // Handle interface types
  if (isInterfaceType(type) && selectionSet) {
    return generateInterfaceTypeZodSchema(type, selectionSet, ctx);
  }

  // Handle object types with nested selections
  if (isObjectType(type) && selectionSet) {
    return generateSelectionSetZodSchema(selectionSet, type, ctx);
  }

  return "z.unknown()";
}

/**
 * Generate a Zod schema for a GraphQL union type
 */
function generateUnionTypeZodSchema(
  type: GraphQLUnionType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GraphQLZodContext,
): string {
  const inlineFragments: string[] = [];

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
        const memberSchema = generateSelectionSetZodSchema(
          sel.selectionSet,
          fragmentType,
          ctx,
        );
        inlineFragments.push(memberSchema);
      }
    }
  }

  if (inlineFragments.length === 0) {
    ctx.warnings.push(
      `Union type "${type.name}" has no inline fragments. Consider adding "... on TypeName { fields }" to select specific fields.`,
    );
    return "z.unknown()";
  }

  if (inlineFragments.length === 1) {
    return inlineFragments[0]!;
  }

  return `z.union([${inlineFragments.join(", ")}])`;
}

/**
 * Generate a Zod schema for a GraphQL interface type
 */
function generateInterfaceTypeZodSchema(
  type: GraphQLInterfaceType,
  selectionSet: { selections: readonly unknown[] },
  ctx: GraphQLZodContext,
): string {
  // Extract common fields and inline fragments
  const result = extractSelectionFields(selectionSet, type, ctx);
  const inlineFragments: string[] = [];

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
        const memberSchema = generateSelectionSetZodSchema(
          sel.selectionSet,
          fragmentType,
          ctx,
        );
        inlineFragments.push(memberSchema);
      }
    }
  }

  // If no inline fragments, return the common fields
  if (inlineFragments.length === 0) {
    if (result.spreadFragments.length > 0) {
      const spreadParts = result.spreadFragments.map(
        (f) => `...${toFragmentSchemaName(f)}.shape`,
      );
      if (result.fields.length > 0) {
        return `z.object({\n  ${spreadParts.join(",\n  ")},\n${result.fields.join(",\n")}\n})`;
      }
      return `z.object({\n  ${spreadParts.join(",\n  ")}\n})`;
    }
    return `z.object({\n${result.fields.join(",\n")}\n})`;
  }

  // With inline fragments, create a union
  if (inlineFragments.length === 1) {
    return inlineFragments[0]!;
  }

  return `z.union([${inlineFragments.join(", ")}])`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract schema dependencies from a Zod type string
 */
function extractDependenciesFromZodSchema(zodType: string): Set<string> {
  const deps = new Set<string>();
  // Match schema references like "petCategorySchema", "userSchema", etc.
  const schemaRefPattern = /([a-z][a-zA-Z0-9]*(?:Fragment)?Schema)/g;
  let match = schemaRefPattern.exec(zodType);
  while (match !== null) {
    const schemaVarName = match[0];
    // Convert schema variable name to type name
    // e.g., "petCategorySchema" -> "PetCategory", "petFieldsFragmentSchema" -> "PetFieldsFragment"
    const baseName = schemaVarName.replace(/Schema$/, "");
    const typeName = toPascalCase(baseName);
    deps.add(typeName);
    match = schemaRefPattern.exec(zodType);
  }
  return deps;
}
