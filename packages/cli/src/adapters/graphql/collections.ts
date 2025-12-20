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
  needsPredicateTranslation,
} from "@/generators/predicates";
import { toCamelCase, toPascalCase } from "@/utils/naming";
import { createWriter, writeImport } from "@/utils/writer";
import {
  analyzeGraphQLQueryCapabilities,
  hasQueryCapabilities,
  inferPredicateMappingPreset,
} from "./analysis";

import type CodeBlockWriter from "code-block-writer";
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
 * Find all queries that return list types (directly or wrapped in pagination objects)
 *
 * This function identifies queries that are suitable for collection generation:
 * 1. Fields that return a list directly (e.g., `users: [User!]!`)
 * 2. Fields that return a wrapper object with a data/items array (e.g., pagination wrappers)
 *
 * It does NOT consider nested arrays on returned objects as list queries.
 * For example, `user(id: ID!): User` where `User` has `posts: [Post!]!` is NOT
 * a list query for Posts - it's a single-item query that happens to have a nested array.
 */
function findListQueries(
  queryType: GraphQLObjectType,
  _schema: GraphQLSchema,
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
      // For direct lists, the selectorPath is just the response key
      // e.g., `query { users { id } }` returns `{ users: [...] }` -> selectorPath = "users"
      const match = findMatchingOperationForDirectList(
        fieldName,
        field,
        directListInfo.itemTypeName,
        documents,
      );
      if (match) {
        results.push(match);
      }
      continue;
    }

    // Check if the return type is a wrapper object (like a pagination envelope)
    // that contains a data/items array field
    //
    // NOTE: We only look for pagination-style wrappers, NOT arbitrary nested arrays.
    // A query like `user(id: ID!): User` where User has `posts: [Post!]!` should NOT
    // be treated as a list query for Posts - that would require a dedicated `posts` query.
    const unwrappedType = unwrapType(field.type);
    if (isObjectType(unwrappedType)) {
      // Only look for common pagination wrapper patterns (data, items, edges, nodes, results)
      const arrayPath = findPaginationArrayField(unwrappedType, warnings);
      if (arrayPath) {
        // Found a pagination wrapper - find matching operation
        const match = findMatchingOperation(
          fieldName,
          field,
          arrayPath.itemTypeName,
          documents,
          `${fieldName}.${arrayPath.path}`,
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
 * Find a pagination-style array field in an object type
 * Only looks for common wrapper patterns like { data: [...] }, { items: [...] }, etc.
 *
 * This is more conservative than findArrayInObjectType - it doesn't recursively
 * search nested objects for arrays, which prevents incorrectly treating single-item
 * queries with nested arrays as list queries.
 */
function findPaginationArrayField(
  type: GraphQLObjectType,
  warnings: string[],
): ArrayPathResult | null {
  const fields = type.getFields();
  const arrayFields: Array<{ fieldName: string; result: ArrayPathResult }> = [];

  // Common pagination wrapper field names
  const paginationFieldNames = new Set([
    "data",
    "items",
    "edges",
    "nodes",
    "results",
    "records",
    "list",
    "rows",
  ]);

  for (const [fieldName, field] of Object.entries(fields)) {
    // Only consider known pagination field names
    if (!paginationFieldNames.has(fieldName.toLowerCase())) {
      continue;
    }

    // Check if this field is a list
    const listInfo = analyzeReturnType(field.type);
    if (listInfo.isList && listInfo.itemTypeName) {
      arrayFields.push({
        fieldName,
        result: { path: fieldName, itemTypeName: listInfo.itemTypeName },
      });
    }
  }

  // If multiple arrays found, warn and take the first
  if (arrayFields.length > 1) {
    const firstField = arrayFields[0];
    const fieldNames = arrayFields.map((f) => f.fieldName).join(", ");
    warnings.push(
      `Multiple pagination array fields found in type "${type.name}": ${fieldNames}. Using first found: "${firstField?.fieldName}". ` +
        `If this is incorrect, configure selectorPath in overrides.db.collections.`,
    );
  }

  return arrayFields[0]?.result ?? null;
}

/**
 * Find the matching document operation for a schema field that returns a direct list.
 * The selectorPath is just the response key (field name or alias).
 *
 * e.g., `query { users { id } }` returns `{ users: [...] }` -> selectorPath = "users"
 */
function findMatchingOperationForDirectList(
  schemaFieldName: string,
  field: GraphQLField<unknown, unknown>,
  itemTypeName: string,
  documents: ParsedDocuments,
): ListQueryMatch | null {
  for (const op of documents.operations) {
    if (op.operation !== "query") continue;

    for (const sel of op.node.selectionSet.selections) {
      if (sel.kind !== Kind.FIELD) continue;

      const fieldNode = sel as FieldNode;
      if (fieldNode.name.value === schemaFieldName) {
        const responseKey = fieldNode.alias?.value || fieldNode.name.value;

        return {
          field,
          typeName: itemTypeName,
          operation: op,
          responseKey,
          // For direct lists, the selectorPath is just the response key
          selectorPath: responseKey,
        };
      }
    }
  }

  return null;
}

/**
 * Find the matching document operation for a schema field with a nested/wrapped array.
 * The selectorPath includes the full path to the array.
 *
 * e.g., pagination wrapper: `query { users { data { id } } }` returns
 * `{ users: { data: [...] } }` -> selectorPath = "users.data"
 */
function findMatchingOperation(
  schemaFieldName: string,
  field: GraphQLField<unknown, unknown>,
  itemTypeName: string,
  documents: ParsedDocuments,
  selectorPath: string,
): ListQueryMatch | null {
  for (const op of documents.operations) {
    if (op.operation !== "query") continue;

    for (const sel of op.node.selectionSet.selections) {
      if (sel.kind !== Kind.FIELD) continue;

      const fieldNode = sel as FieldNode;
      if (fieldNode.name.value === schemaFieldName) {
        const responseKey = fieldNode.alias?.value || fieldNode.name.value;

        // For wrapped arrays, replace the schema field name with the response key in the path
        // e.g., if field is "users" but aliased as "allUsers", and selectorPath is "users.data",
        // we want "allUsers.data"
        const adjustedPath = selectorPath.startsWith(schemaFieldName)
          ? responseKey + selectorPath.slice(schemaFieldName.length)
          : selectorPath;

        return {
          field,
          typeName: itemTypeName,
          operation: op,
          responseKey,
          selectorPath: adjustedPath,
        };
      }
    }
  }

  return null;
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
  const writer = createWriter();

  // Check if any entities need predicate translation (on-demand mode)
  const hasOnDemandEntities = entities.some(needsPredicateTranslation);

  // External imports (sorted alphabetically by package)
  const queryDbCollectionImports = ["queryCollectionOptions"];
  if (hasOnDemandEntities) {
    queryDbCollectionImports.push("parseLoadSubsetOptions");
    queryDbCollectionImports.sort();
  }
  writeImport(
    writer,
    "@tanstack/query-db-collection",
    queryDbCollectionImports,
  );
  writeImport(writer, "@tanstack/react-db", ["createCollection"]);

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
    writer.blankLine();
    writeImport(writer, FUNCTIONS_IMPORT_PATH, allFunctionImports);
  }

  // Type imports (sorted alphabetically, always last with blank line)
  writer.blankLine();
  if (hasOnDemandEntities) {
    writeImport(writer, "@tanstack/db", ["LoadSubsetOptions"], true);
  }
  writeImport(writer, "@tanstack/react-query", ["QueryClient"], true);

  // Import variables types for on-demand entities (these are actually used in predicate translators)
  const variablesTypeNames = entities
    .filter(needsPredicateTranslation)
    .map((e) => e.listQuery.paramsTypeName)
    .filter((name): name is string => !!name)
    .sort();

  if (variablesTypeNames.length > 0) {
    writeImport(writer, options.typesImportPath, variablesTypeNames, true);
  }

  writer.blankLine();

  // Generate predicate translators for on-demand entities
  for (const entity of entities) {
    if (needsPredicateTranslation(entity)) {
      writer.writeLine(
        generatePredicateTranslator(
          entity,
          entity.listQuery.paramsTypeName,
          "graphql",
        ),
      );
      writer.blankLine();
    }
  }

  // Generate collection options for each entity
  for (const entity of entities) {
    writeEntityCollectionOptions(writer, entity);
    writer.blankLine();
  }

  return {
    filename: "collections.ts",
    content: writer.toString(),
  };
}

/**
 * Write collection options for a single entity
 */
function writeEntityCollectionOptions(
  writer: CodeBlockWriter,
  entity: CollectionEntity,
): void {
  const collectionName = `${toCamelCase(entity.name)}CollectionOptions`;
  const listQueryFn = `${toCamelCase(entity.listQuery.operationName)}`;
  const isOnDemand = needsPredicateTranslation(entity);
  const translatorFn = `translate${entity.name}Predicates`;
  const selectorPath = entity.listQuery.selectorPath;

  // JSDoc comment
  writer.writeLine("/**");
  writer.writeLine(` * Collection options for ${entity.name}`);
  if (isOnDemand) {
    writer.writeLine(
      " * @remarks Uses on-demand sync mode with predicate push-down",
    );
  }
  writer.writeLine(" */");

  // Export const declaration
  writer.write(
    `export const ${collectionName} = (queryClient: QueryClient) =>`,
  );
  writer.newLine();
  writer.indent(() => {
    writer.write("createCollection(");
    writer.newLine();
    writer.indent(() => {
      writer.write("queryCollectionOptions({");
      writer.newLine();
      writer.indent(() => {
        writer.writeLine(
          `queryKey: ${JSON.stringify(entity.listQuery.queryKey)},`,
        );

        // Generate queryFn based on sync mode AND selectorPath
        if (isOnDemand) {
          writer.writeLine(`syncMode: "on-demand",`);
          writer.write("queryFn: async (ctx) => ");
          writer.inlineBlock(() => {
            writer.writeLine(
              `const variables = ${translatorFn}(ctx.meta?.loadSubsetOptions)`,
            );
            if (selectorPath) {
              writer.writeLine(
                `const response = await ${listQueryFn}(variables)`,
              );
              writer.writeLine(`return response.${selectorPath}`);
            } else {
              writer.writeLine(`return ${listQueryFn}(variables)`);
            }
          });
          writer.write(",");
          writer.newLine();
        } else {
          if (selectorPath) {
            writer.write("queryFn: async () => ");
            writer.inlineBlock(() => {
              writer.writeLine(`const response = await ${listQueryFn}()`);
              writer.writeLine(`return response.${selectorPath}`);
            });
            writer.write(",");
            writer.newLine();
          } else {
            writer.writeLine(`queryFn: async () => ${listQueryFn}(),`);
          }
        }

        writer.writeLine("queryClient,");
        writer.writeLine(`getKey: (item) => item.${entity.keyField},`);

        // Add persistence handlers for mutations
        const insertMutation = entity.mutations.find(
          (m) => m.type === "insert",
        );
        const updateMutation = entity.mutations.find(
          (m) => m.type === "update",
        );
        const deleteMutation = entity.mutations.find(
          (m) => m.type === "delete",
        );

        if (insertMutation) {
          const insertFn = toCamelCase(insertMutation.operationName);
          writer.write("onInsert: async ({ transaction }) => ");
          writer.inlineBlock(() => {
            writer.writeLine(
              `await Promise.all(transaction.mutations.map((m) => ${insertFn}({ input: m.modified })))`,
            );
          });
          writer.write(",");
          writer.newLine();
        }

        if (updateMutation) {
          const updateFn = toCamelCase(updateMutation.operationName);
          writer.write("onUpdate: async ({ transaction }) => ");
          writer.inlineBlock(() => {
            writer.writeLine(
              `await Promise.all(transaction.mutations.map((m) => ${updateFn}({ ${entity.keyField}: m.original.${entity.keyField}, input: m.changes })))`,
            );
          });
          writer.write(",");
          writer.newLine();
        }

        if (deleteMutation) {
          const deleteFn = toCamelCase(deleteMutation.operationName);
          writer.write("onDelete: async ({ transaction }) => ");
          writer.inlineBlock(() => {
            writer.writeLine(
              `await Promise.all(transaction.mutations.map((m) => ${deleteFn}({ ${entity.keyField}: m.key })))`,
            );
          });
          writer.write(",");
          writer.newLine();
        }
      });
      writer.write("})");
      writer.newLine();
    });
    writer.write(")");
  });
}
