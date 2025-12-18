/**
 * GraphQL Collection Discovery and Generation
 *
 * Discovers entities from GraphQL schemas/documents for TanStack DB collection generation.
 * Identifies list queries, CRUD mutations, and key fields automatically.
 * Supports on-demand sync mode with predicate push-down.
 */

import {
  GraphQLList,
  GraphQLNonNull,
  Kind,
  isObjectType,
  isScalarType,
} from "graphql";

import {
  generatePredicateTranslator,
  getPredicateImports,
  needsPredicateTranslation,
} from "@/generators/predicates";
import { toCamelCase, toPascalCase } from "@/utils/naming";
import {
  analyzeGraphQLQueryCapabilities,
  hasQueryCapabilities,
  inferPredicateMappingPreset,
} from "./analysis";

import type {
  FieldNode,
  GraphQLField,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
} from "graphql";
import type { CollectionOverrideConfig } from "@/core/config";
import type { ParsedDocuments, ParsedOperation } from "@/core/documents";
import type {
  CollectionDiscoveryResult,
  CollectionEntity,
  CollectionGenOptions,
  CollectionMutation,
  GeneratedFile,
  GraphQLAdapterSchema,
} from "../types";

/** Hardcoded import path for functions (always ../functions from db/) */
const FUNCTIONS_IMPORT_PATH = "../functions";

/** Maximum depth to search for arrays in nested types */
const MAX_ARRAY_SEARCH_DEPTH = 3;

/**
 * Result of finding an array in a type
 */
interface ArrayPathResult {
  /** Dot-separated path to the array field (e.g., "data" or "results.items") */
  path: string;
  /** The name of the item type in the array */
  itemTypeName: string;
}

/**
 * Extended result from findListQueries including selector path info
 */
interface ListQueryMatch {
  field: GraphQLField<unknown, unknown>;
  /** The item type name (e.g., "Pet") */
  typeName: string;
  operation: ParsedOperation;
  /** The key used in the response (alias or field name) */
  responseKey: string;
  /** Full selector path to extract array from response (e.g., "pets.data") */
  selectorPath: string | undefined;
}

/**
 * Discover entities from a GraphQL schema for collection generation
 */
export function discoverGraphQLEntities(
  schema: GraphQLAdapterSchema,
  overrides?: Record<string, CollectionOverrideConfig>,
): CollectionDiscoveryResult {
  const warnings: string[] = [];
  const entities: CollectionEntity[] = [];

  // Get list queries from schema's Query type
  const queryType = schema.schema.getQueryType();
  if (!queryType) {
    warnings.push("No Query type found in schema");
    return { entities, warnings };
  }

  // Find all queries that return list types (direct or wrapped)
  const listQueries = findListQueries(
    queryType,
    schema.schema,
    schema.documents,
    warnings,
  );

  for (const {
    field,
    typeName,
    operation,
    responseKey,
    selectorPath,
  } of listQueries) {
    const entity = discoverEntityFromListQuery(
      field,
      typeName,
      operation,
      responseKey,
      selectorPath,
      schema.schema,
      schema.documents,
      overrides,
      warnings,
    );

    if (entity) {
      // Check for duplicate entities (same type from different queries)
      const existing = entities.find((e) => e.typeName === entity.typeName);
      if (!existing) {
        entities.push(entity);
      }
    }
  }

  return { entities, warnings };
}

/**
 * Find all queries that return list types (directly or wrapped in objects)
 */
function findListQueries(
  queryType: GraphQLObjectType,
  schema: GraphQLSchema,
  documents: ParsedDocuments,
  warnings: string[],
): ListQueryMatch[] {
  const results: ListQueryMatch[] = [];

  const fields = queryType.getFields();

  for (const [fieldName, field] of Object.entries(fields)) {
    // Check if this field returns a list type directly
    const directListInfo = analyzeReturnType(field.type);

    if (directListInfo.isList && directListInfo.itemTypeName) {
      // Direct list return - find matching operation
      const match = findMatchingOperation(
        fieldName,
        field,
        directListInfo.itemTypeName,
        documents,
        undefined,
      );
      if (match) {
        results.push(match);
      }
      continue;
    }

    // Check if the return type is an object that contains a list (wrapped response)
    const unwrappedType = unwrapType(field.type);
    if (isObjectType(unwrappedType)) {
      const arrayPath = findArrayInObjectType(
        unwrappedType,
        schema,
        warnings,
        MAX_ARRAY_SEARCH_DEPTH,
      );
      if (arrayPath) {
        // Found a wrapped array - find matching operation
        const match = findMatchingOperation(
          fieldName,
          field,
          arrayPath.itemTypeName,
          documents,
          arrayPath.path,
        );
        if (match) {
          results.push(match);
        }
      }
    }
  }

  return results;
}

/**
 * Find the matching document operation for a schema field
 */
function findMatchingOperation(
  schemaFieldName: string,
  field: GraphQLField<unknown, unknown>,
  itemTypeName: string,
  documents: ParsedDocuments,
  innerPath: string | undefined,
): ListQueryMatch | null {
  // Find operation that queries this field
  for (const op of documents.operations) {
    if (op.operation !== "query") continue;

    // Find the field selection that matches this schema field
    for (const sel of op.node.selectionSet.selections) {
      if (sel.kind !== Kind.FIELD) continue;

      const fieldNode = sel as FieldNode;
      // Check if this selection targets our schema field
      if (fieldNode.name.value === schemaFieldName) {
        // Get the response key (alias if present, otherwise field name)
        const responseKey = fieldNode.alias?.value || fieldNode.name.value;

        // Build the full selector path
        const selectorPath = innerPath
          ? `${responseKey}.${innerPath}`
          : undefined;

        return {
          field,
          typeName: itemTypeName,
          operation: op,
          responseKey,
          selectorPath,
        };
      }
    }
  }

  return null;
}

/**
 * Recursively search an object type for a list field
 * Returns the path to the list and the item type name
 */
function findArrayInObjectType(
  type: GraphQLObjectType,
  schema: GraphQLSchema,
  warnings: string[],
  maxDepth: number,
  currentDepth: number = 0,
  visitedTypes: Set<string> = new Set(),
): ArrayPathResult | null {
  if (currentDepth >= maxDepth) return null;

  // Prevent infinite recursion on cyclic types
  if (visitedTypes.has(type.name)) return null;
  visitedTypes.add(type.name);

  const fields = type.getFields();
  const arrayFields: Array<{ fieldName: string; result: ArrayPathResult }> = [];

  for (const [fieldName, field] of Object.entries(fields)) {
    // Check if this field is a list
    const listInfo = analyzeReturnType(field.type);
    if (listInfo.isList && listInfo.itemTypeName) {
      arrayFields.push({
        fieldName,
        result: { path: fieldName, itemTypeName: listInfo.itemTypeName },
      });
      continue;
    }

    // If it's an object type, recurse
    const unwrapped = unwrapType(field.type);
    if (isObjectType(unwrapped)) {
      const nested = findArrayInObjectType(
        unwrapped,
        schema,
        warnings,
        maxDepth,
        currentDepth + 1,
        visitedTypes,
      );
      if (nested) {
        arrayFields.push({
          fieldName,
          result: {
            path: `${fieldName}.${nested.path}`,
            itemTypeName: nested.itemTypeName,
          },
        });
      }
    }
  }

  // If multiple arrays found at this level, warn and take the first
  if (arrayFields.length > 1) {
    const firstField = arrayFields[0];
    const fieldNames = arrayFields.map((f) => f.fieldName).join(", ");
    warnings.push(
      `Multiple array fields found in type "${type.name}": ${fieldNames}. Using first found: "${firstField?.fieldName}". ` +
        `If this is incorrect, configure selectorPath in overrides.db.collections.`,
    );
  }

  return arrayFields[0]?.result ?? null;
}

/**
 * Analyze a GraphQL return type to determine if it's a list and extract the item type
 */
function analyzeReturnType(type: GraphQLOutputType): {
  isList: boolean;
  itemTypeName: string | null;
} {
  // Unwrap NonNull
  let unwrapped = type;
  if (unwrapped instanceof GraphQLNonNull) {
    unwrapped = unwrapped.ofType;
  }

  // Check if it's a list
  if (unwrapped instanceof GraphQLList) {
    // Get the item type
    let itemType = unwrapped.ofType;
    if (itemType instanceof GraphQLNonNull) {
      itemType = itemType.ofType;
    }

    if (isObjectType(itemType)) {
      return { isList: true, itemTypeName: itemType.name };
    }
  }

  return { isList: false, itemTypeName: null };
}

/**
 * Discover an entity from a list query
 */
function discoverEntityFromListQuery(
  field: GraphQLField<unknown, unknown>,
  typeName: string,
  operation: ParsedOperation,
  _responseKey: string,
  selectorPath: string | undefined,
  graphqlSchema: GraphQLSchema,
  documents: ParsedDocuments,
  overrides?: Record<string, CollectionOverrideConfig>,
  warnings: string[] = [],
): CollectionEntity | null {
  // Get the GraphQL type
  const type = graphqlSchema.getType(typeName);
  if (!type || !isObjectType(type)) {
    warnings.push(`Could not find object type ${typeName} in schema`);
    return null;
  }

  // Get overrides for this entity
  const entityOverrides = overrides?.[typeName];

  // Use override for selectorPath if provided
  const finalSelectorPath = entityOverrides?.selectorPath ?? selectorPath;

  // Find key field
  const keyFieldOverride = entityOverrides?.keyField;
  const { keyField, keyFieldType } = findKeyField(
    type,
    keyFieldOverride,
    warnings,
    typeName,
  );

  if (!keyField) {
    warnings.push(
      `Could not find key field for entity ${typeName} - skipping collection generation`,
    );
    return null;
  }

  // Find CRUD mutations for this entity
  const mutations = findCrudMutations(typeName, documents, graphqlSchema);

  // Analyze query field for filter/sort/pagination capabilities
  const queryCapabilities = analyzeGraphQLQueryCapabilities(field);

  // Check for syncMode override and warn if on-demand but no capabilities
  const syncMode = entityOverrides?.syncMode;
  if (syncMode === "on-demand" && !hasQueryCapabilities(queryCapabilities)) {
    warnings.push(
      `Entity "${typeName}" configured for on-demand sync, but no filtering arguments detected on the query field. Collection will fetch all data regardless of predicates.`,
    );
  }

  // Determine variables type name if query has arguments
  const hasArgs = field.args.length > 0;
  const variablesTypeName = hasArgs
    ? `${toPascalCase(operation.name)}QueryVariables`
    : undefined;

  // Infer predicate mapping from capabilities if not explicitly configured
  const detectedPreset = inferPredicateMappingPreset(queryCapabilities);

  return {
    name: typeName,
    typeName: toPascalCase(typeName),
    keyField,
    keyFieldType,
    listQuery: {
      operationName: operation.name,
      queryKey: [typeName],
      paramsTypeName: variablesTypeName,
      selectorPath: finalSelectorPath,
    },
    mutations,
    // On-demand mode properties
    syncMode,
    predicateMapping: entityOverrides?.predicateMapping ?? detectedPreset,
    filterCapabilities: queryCapabilities.filter,
    sortCapabilities: queryCapabilities.sort,
    paginationCapabilities: queryCapabilities.pagination,
  };
}

/**
 * Find the key field in a GraphQL object type
 */
function findKeyField(
  type: GraphQLObjectType,
  override?: string,
  warnings: string[] = [],
  typeName?: string,
): { keyField: string | null; keyFieldType: string } {
  const fields = type.getFields();

  // Use override if provided
  if (override) {
    if (fields[override]) {
      const field = fields[override];
      return {
        keyField: override,
        keyFieldType: getTypeScriptType(field.type),
      };
    }
    warnings.push(
      `Configured keyField '${override}' not found in type ${typeName || "unknown"}`,
    );
  }

  // Look for 'id' field with ID scalar type (common GraphQL pattern)
  if (fields.id) {
    const idField = fields.id;
    const idType = unwrapType(idField.type);
    if (isScalarType(idType) && idType.name === "ID") {
      return { keyField: "id", keyFieldType: "string" };
    }
  }

  // Look for common key field names
  const keyFieldCandidates = ["id", "_id", "uuid", "key"];

  for (const candidate of keyFieldCandidates) {
    if (fields[candidate]) {
      const field = fields[candidate];
      return {
        keyField: candidate,
        keyFieldType: getTypeScriptType(field.type),
      };
    }
  }

  return { keyField: null, keyFieldType: "string" };
}

/**
 * Unwrap NonNull and List types to get the underlying type
 */
function unwrapType(type: GraphQLOutputType): GraphQLOutputType {
  if (type instanceof GraphQLNonNull || type instanceof GraphQLList) {
    return unwrapType(type.ofType);
  }
  return type;
}

/**
 * Get TypeScript type from GraphQL type
 */
function getTypeScriptType(type: GraphQLOutputType): string {
  const unwrapped = unwrapType(type);

  if (isScalarType(unwrapped)) {
    switch (unwrapped.name) {
      case "Int":
      case "Float":
        return "number";
      case "Boolean":
        return "boolean";
      default:
        return "string";
    }
  }

  return "string";
}

/**
 * Find CRUD mutations for an entity by naming convention
 */
function findCrudMutations(
  typeName: string,
  documents: ParsedDocuments,
  _schema: GraphQLSchema,
): CollectionMutation[] {
  const mutations: CollectionMutation[] = [];
  const typeNameLower = typeName.toLowerCase();

  // Get all mutation operations from documents
  const mutationOps = documents.operations.filter(
    (op) => op.operation === "mutation",
  );

  for (const mutation of mutationOps) {
    const nameLower = mutation.name.toLowerCase();

    // Check for create/insert mutation
    if (nameLower.startsWith("create") && nameLower.includes(typeNameLower)) {
      mutations.push({
        type: "insert",
        operationName: mutation.name,
        inputTypeName: `${toPascalCase(mutation.name)}Variables`,
      });
    }

    // Check for update mutation
    if (nameLower.startsWith("update") && nameLower.includes(typeNameLower)) {
      mutations.push({
        type: "update",
        operationName: mutation.name,
        inputTypeName: `${toPascalCase(mutation.name)}Variables`,
      });
    }

    // Check for delete mutation
    if (
      (nameLower.startsWith("delete") || nameLower.startsWith("remove")) &&
      nameLower.includes(typeNameLower)
    ) {
      mutations.push({
        type: "delete",
        operationName: mutation.name,
      });
    }
  }

  return mutations;
}

// =============================================================================
// Code Generation
// =============================================================================

/**
 * Generate TanStack DB collection options code for GraphQL
 */
export function generateGraphQLCollections(
  entities: CollectionEntity[],
  options: CollectionGenOptions,
): GeneratedFile {
  const lines: string[] = [];

  // Check if any entities need predicate translation (on-demand mode)
  const hasOnDemandEntities = entities.some(needsPredicateTranslation);

  // External imports (sorted alphabetically by package)
  lines.push(
    'import { queryCollectionOptions } from "@tanstack/query-db-collection"',
  );
  if (hasOnDemandEntities) {
    lines.push(getPredicateImports());
  }
  lines.push('import { createCollection } from "@tanstack/react-db"');

  // Internal imports (sorted alphabetically)
  const queryFnImports = entities.map(
    (e) => `${toCamelCase(e.listQuery.operationName)}`,
  );
  const mutationFnImports = entities.flatMap((e) =>
    e.mutations.map((m) => `${toCamelCase(m.operationName)}`),
  );
  const allFunctionImports = [
    ...new Set([...queryFnImports, ...mutationFnImports]),
  ].sort();

  if (allFunctionImports.length > 0) {
    lines.push("");
    lines.push(
      `import { ${allFunctionImports.join(", ")} } from "${FUNCTIONS_IMPORT_PATH}"`,
    );
  }

  // Type imports (sorted alphabetically, always last with blank line)
  const typeImports: string[] = ["QueryClient"];

  // Import variables types for on-demand entities (these are actually used in predicate translators)
  const variablesTypeNames = entities
    .filter(needsPredicateTranslation)
    .map((e) => e.listQuery.paramsTypeName)
    .filter((name): name is string => !!name)
    .sort();

  lines.push("");
  lines.push(
    `import type { ${typeImports.join(", ")} } from "@tanstack/react-query"`,
  );

  if (variablesTypeNames.length > 0) {
    lines.push(
      `import type { ${variablesTypeNames.join(", ")} } from "${options.typesImportPath}"`,
    );
  }

  lines.push("");

  // Generate predicate translators for on-demand entities
  for (const entity of entities) {
    if (needsPredicateTranslation(entity)) {
      lines.push(
        generatePredicateTranslator(
          entity,
          entity.listQuery.paramsTypeName,
          "graphql",
        ),
      );
      lines.push("");
    }
  }

  // Generate collection options for each entity
  for (const entity of entities) {
    lines.push(generateEntityCollectionOptions(entity, options));
    lines.push("");
  }

  return {
    filename: "collections.ts",
    content: lines.join("\n"),
  };
}

/**
 * Generate collection options for a single entity
 */
function generateEntityCollectionOptions(
  entity: CollectionEntity,
  _options: CollectionGenOptions,
): string {
  const lines: string[] = [];
  const collectionName = `${toCamelCase(entity.name)}CollectionOptions`;
  const listQueryFn = `${toCamelCase(entity.listQuery.operationName)}`;
  const isOnDemand = needsPredicateTranslation(entity);
  const translatorFn = `translate${entity.name}Predicates`;
  const selectorPath = entity.listQuery.selectorPath;

  lines.push("/**");
  lines.push(` * Collection options for ${entity.name}`);
  if (isOnDemand) {
    lines.push(` * @remarks Uses on-demand sync mode with predicate push-down`);
  }
  lines.push(" */");
  lines.push(`export const ${collectionName} = (queryClient: QueryClient) =>`);
  lines.push(`  createCollection(`);
  lines.push(`    queryCollectionOptions({`);
  lines.push(`      queryKey: ${JSON.stringify(entity.listQuery.queryKey)},`);

  // Generate queryFn based on sync mode AND selectorPath
  if (isOnDemand) {
    lines.push(`      syncMode: "on-demand",`);
    lines.push(`      queryFn: async (ctx) => {`);
    lines.push(
      `        const variables = ${translatorFn}(ctx.meta?.loadSubsetOptions)`,
    );
    if (selectorPath) {
      lines.push(`        const response = await ${listQueryFn}(variables)`);
      lines.push(`        return response.${selectorPath}`);
    } else {
      lines.push(`        return ${listQueryFn}(variables)`);
    }
    lines.push(`      },`);
  } else {
    if (selectorPath) {
      lines.push(`      queryFn: async () => {`);
      lines.push(`        const response = await ${listQueryFn}()`);
      lines.push(`        return response.${selectorPath}`);
      lines.push(`      },`);
    } else {
      lines.push(`      queryFn: async () => ${listQueryFn}(),`);
    }
  }

  lines.push(`      queryClient,`);
  lines.push(`      getKey: (item) => item.${entity.keyField},`);

  // Add persistence handlers for mutations
  const insertMutation = entity.mutations.find((m) => m.type === "insert");
  const updateMutation = entity.mutations.find((m) => m.type === "update");
  const deleteMutation = entity.mutations.find((m) => m.type === "delete");

  if (insertMutation) {
    const insertFn = toCamelCase(insertMutation.operationName);
    lines.push(`      onInsert: async ({ transaction }) => {`);
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${insertFn}({ input: m.modified })))`,
    );
    lines.push(`      },`);
  }

  if (updateMutation) {
    const updateFn = toCamelCase(updateMutation.operationName);
    lines.push(`      onUpdate: async ({ transaction }) => {`);
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${updateFn}({ ${entity.keyField}: m.original.${entity.keyField}, input: m.changes })))`,
    );
    lines.push(`      },`);
  }

  if (deleteMutation) {
    const deleteFn = toCamelCase(deleteMutation.operationName);
    lines.push(`      onDelete: async ({ transaction }) => {`);
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${deleteFn}({ ${entity.keyField}: m.key })))`,
    );
    lines.push(`      },`);
  }

  lines.push(`    })`);
  lines.push(`  )`);

  return lines.join("\n");
}
