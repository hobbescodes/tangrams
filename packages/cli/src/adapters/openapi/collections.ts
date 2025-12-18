/**
 * OpenAPI Collection Discovery and Generation
 *
 * Discovers entities from OpenAPI specs for TanStack DB collection generation.
 * Identifies list queries, CRUD mutations, and key fields automatically.
 * Supports on-demand sync mode with predicate push-down.
 */

import {
  generatePredicateTranslator,
  getPredicateImports,
  needsPredicateTranslation,
} from "@/generators/predicates";
import { toCamelCase, toPascalCase } from "@/utils/naming";
import { analyzeQueryParameters, hasQueryCapabilities } from "./analysis";

import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import type { CollectionOverrideConfig } from "@/core/config";
import type {
  CollectionDiscoveryResult,
  CollectionEntity,
  CollectionGenOptions,
  CollectionMutation,
  GeneratedFile,
  OpenAPIAdapterSchema,
} from "../types";
import type { ParsedOperation } from "./schema";

/** Hardcoded import path for functions (always ../functions from db/) */
const FUNCTIONS_IMPORT_PATH = "../functions";

/** Maximum depth to search for arrays in nested schemas */
const MAX_ARRAY_SEARCH_DEPTH = 3;

type OpenAPISchema = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
type OpenAPIArraySchema =
  | OpenAPIV3.ArraySchemaObject
  | OpenAPIV3_1.ArraySchemaObject;

/**
 * Result of finding an array in a schema
 */
interface ArrayPathResult {
  /** Path segments to reach the array (e.g., ["data"] or ["response", "items"]) */
  path: string[];
  /** The array schema containing the items */
  arraySchema: OpenAPIArraySchema;
}

/**
 * Recursively search a schema for an array field
 * Returns the path to the array and the array schema
 */
function findArrayInSchema(
  schema: OpenAPISchema,
  warnings: string[],
  maxDepth: number = MAX_ARRAY_SEARCH_DEPTH,
  currentPath: string[] = [],
  currentDepth: number = 0,
): ArrayPathResult | null {
  if (currentDepth >= maxDepth) return null;

  // Direct array - found it!
  if (schema.type === "array" && "items" in schema) {
    return {
      path: currentPath,
      arraySchema: schema as OpenAPIArraySchema,
    };
  }

  // Object - search properties for arrays
  if (schema.type === "object" && schema.properties) {
    const arrayFields: Array<{ propName: string; result: ArrayPathResult }> =
      [];

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const result = findArrayInSchema(
        propSchema as OpenAPISchema,
        warnings,
        maxDepth,
        [...currentPath, propName],
        currentDepth + 1,
      );
      if (result) {
        arrayFields.push({ propName, result });
      }
    }

    // If multiple arrays found at this level, warn and take the first
    if (arrayFields.length > 1) {
      const firstField = arrayFields[0];
      const propNames = arrayFields.map((f) => f.propName).join(", ");
      warnings.push(
        `Multiple array fields found in response schema: ${propNames}. Using first found: "${firstField?.propName}". ` +
          `If this is incorrect, configure selectorPath in overrides.db.collections.`,
      );
    }

    return arrayFields[0]?.result ?? null;
  }

  return null;
}

/**
 * Check if a response schema contains an array (either directly or wrapped)
 * Returns the array schema and selector path if found
 * Uses schema-walking approach to find arrays at any nesting level
 */
function findArrayInResponse(
  responseSchema: OpenAPISchema,
  warnings: string[],
): { arraySchema: OpenAPIArraySchema; selectorPath: string | null } | null {
  const result = findArrayInSchema(responseSchema, warnings);
  if (!result) return null;

  return {
    arraySchema: result.arraySchema,
    selectorPath: result.path.length > 0 ? result.path.join(".") : null,
  };
}

/**
 * Discover entities from an OpenAPI schema for collection generation
 */
export function discoverOpenAPIEntities(
  schema: OpenAPIAdapterSchema,
  operations: ParsedOperation[],
  overrides?: Record<string, CollectionOverrideConfig>,
): CollectionDiscoveryResult {
  const warnings: string[] = [];
  const entities: CollectionEntity[] = [];

  // Find all GET operations that return arrays - these are our list queries
  // Support both direct arrays and wrapped arrays (e.g., { data: Pet[] })
  // Note: We pass an empty warnings array here since we only care about detection,
  // actual warnings are collected during entity discovery
  const listQueries = operations.filter((op) => {
    if (op.method !== "get") return false;
    if (!op.responseSchema) return false;

    // Check if response contains an array (directly or wrapped)
    return findArrayInResponse(op.responseSchema as OpenAPISchema, []) !== null;
  });

  for (const listQuery of listQueries) {
    const entity = discoverEntityFromListQuery(
      listQuery,
      operations,
      schema.document,
      overrides,
      warnings,
    );

    if (entity) {
      entities.push(entity);
    }
  }

  return { entities, warnings };
}

/**
 * Discover an entity from a list query operation
 */
function discoverEntityFromListQuery(
  listQuery: ParsedOperation,
  allOperations: ParsedOperation[],
  document: OpenAPIAdapterSchema["document"],
  overrides?: Record<string, CollectionOverrideConfig>,
  warnings: string[] = [],
): CollectionEntity | null {
  const responseSchema = listQuery.responseSchema as OpenAPISchema;
  if (!responseSchema) {
    return null;
  }

  // Find the array in the response (direct or wrapped)
  const arrayInfo = findArrayInResponse(responseSchema, warnings);
  if (!arrayInfo) {
    return null;
  }

  // Get the item schema from the array (arraySchema is typed as OpenAPIArraySchema which has items)
  const itemSchema = arrayInfo.arraySchema.items as OpenAPISchema | undefined;
  if (!itemSchema) {
    warnings.push(
      `Could not determine item type for list query ${listQuery.operationId}`,
    );
    return null;
  }

  // Store the auto-detected selector path for wrapped responses
  const autoDetectedSelectorPath = arrayInfo.selectorPath;

  // Determine entity name from the path or response schema
  const entityName = inferEntityName(listQuery.path, itemSchema, document);
  if (!entityName) {
    warnings.push(
      `Could not determine entity name for list query ${listQuery.operationId}`,
    );
    return null;
  }

  // Get overrides for this entity
  const entityOverrides = overrides?.[entityName];

  // Use override for selectorPath if provided, otherwise use auto-detected
  const selectorPath =
    entityOverrides?.selectorPath ?? autoDetectedSelectorPath;

  // Find key field
  const keyFieldOverride = entityOverrides?.keyField;
  const { keyField, keyFieldType } = findKeyField(
    itemSchema,
    keyFieldOverride,
    warnings,
    entityName,
  );

  if (!keyField) {
    warnings.push(
      `Could not find key field for entity ${entityName} - skipping collection generation`,
    );
    return null;
  }

  // Find CRUD mutations for this entity
  const mutations = findCrudMutations(
    listQuery.path,
    allOperations,
    entityName,
  );

  // Determine the TypeScript type name
  const typeName = toPascalCase(entityName);

  // Analyze query parameters for filter/sort/pagination capabilities
  const queryCapabilities = analyzeQueryParameters(listQuery.queryParams);

  // Check for syncMode override and warn if on-demand but no capabilities
  const syncMode = entityOverrides?.syncMode;
  if (syncMode === "on-demand" && !hasQueryCapabilities(queryCapabilities)) {
    warnings.push(
      `Entity "${entityName}" configured for on-demand sync, but no filtering parameters detected in ${listQuery.path}. Collection will fetch all data regardless of predicates.`,
    );
  }

  // Determine params type name if the list query accepts parameters
  const hasQueryParams = listQuery.queryParams.length > 0;
  const paramsTypeName = hasQueryParams
    ? `${toPascalCase(listQuery.operationId)}Params`
    : undefined;

  return {
    name: entityName,
    typeName,
    keyField,
    keyFieldType,
    listQuery: {
      operationName: listQuery.operationId,
      queryKey: [entityName],
      paramsTypeName,
      selectorPath: selectorPath ?? undefined,
    },
    mutations,
    // On-demand mode properties
    syncMode,
    predicateMapping:
      entityOverrides?.predicateMapping ??
      (queryCapabilities.filter.filterStyle !== "custom"
        ? queryCapabilities.filter.filterStyle
        : undefined),
    filterCapabilities: queryCapabilities.filter,
    sortCapabilities: queryCapabilities.sort,
    paginationCapabilities: queryCapabilities.pagination,
  };
}

/**
 * Infer the entity name from the path or schema
 */
function inferEntityName(
  path: string,
  itemSchema: OpenAPISchema,
  document: OpenAPIAdapterSchema["document"],
): string | null {
  // First try to get name from schema title
  if (itemSchema.title) {
    return itemSchema.title;
  }

  // Try to find the schema name from components
  const schemaName = findSchemaNameInComponents(itemSchema, document);
  if (schemaName) {
    return schemaName;
  }

  // Fallback: derive from path
  // e.g., /pets -> Pet, /users -> User, /api/v1/orders -> Order
  const pathParts = path.split("/").filter(Boolean);

  // Find the last non-parameter segment
  for (let i = pathParts.length - 1; i >= 0; i--) {
    const part = pathParts[i];
    if (part && !part.startsWith("{")) {
      // Singularize (simple version - remove trailing 's')
      const singular = singularize(part);
      return toPascalCase(singular);
    }
  }

  return null;
}

/**
 * Find the schema name in components/schemas that matches this schema
 */
function findSchemaNameInComponents(
  schema: OpenAPISchema,
  document: OpenAPIAdapterSchema["document"],
): string | null {
  const components = document.components?.schemas;
  if (!components) return null;

  // Compare schemas by structure (simple comparison)
  for (const [name, componentSchema] of Object.entries(components)) {
    if (schemasMatch(schema, componentSchema as OpenAPISchema)) {
      return name;
    }
  }

  return null;
}

/**
 * Simple schema comparison
 */
function schemasMatch(a: OpenAPISchema, b: OpenAPISchema): boolean {
  // Compare by properties if both are objects
  if (a.type === "object" && b.type === "object") {
    const aProps = Object.keys(a.properties || {}).sort();
    const bProps = Object.keys(b.properties || {}).sort();
    return JSON.stringify(aProps) === JSON.stringify(bProps);
  }
  return false;
}

/**
 * Simple singularize function
 */
function singularize(word: string): string {
  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith("es") && !word.endsWith("ss")) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Find the key field in a schema
 */
function findKeyField(
  schema: OpenAPISchema,
  override?: string,
  warnings: string[] = [],
  entityName?: string,
): { keyField: string | null; keyFieldType: string } {
  const properties = schema.properties || {};

  // Use override if provided
  if (override) {
    if (properties[override]) {
      const propSchema = properties[override] as OpenAPISchema;
      return {
        keyField: override,
        keyFieldType: getTypeScriptType(propSchema),
      };
    }
    warnings.push(
      `Configured keyField '${override}' not found in entity ${entityName || "unknown"}`,
    );
  }

  // Look for common key field names
  const keyFieldCandidates = ["id", "ID", "_id", "uuid", "key"];

  for (const candidate of keyFieldCandidates) {
    if (properties[candidate]) {
      const propSchema = properties[candidate] as OpenAPISchema;
      return {
        keyField: candidate,
        keyFieldType: getTypeScriptType(propSchema),
      };
    }
  }

  // Look for fields ending in "Id" that match the entity name
  if (entityName) {
    const entityIdField = `${toCamelCase(entityName)}Id`;
    if (properties[entityIdField]) {
      const propSchema = properties[entityIdField] as OpenAPISchema;
      return {
        keyField: entityIdField,
        keyFieldType: getTypeScriptType(propSchema),
      };
    }
  }

  return { keyField: null, keyFieldType: "string" };
}

/**
 * Get TypeScript type from OpenAPI schema
 */
function getTypeScriptType(schema: OpenAPISchema): string {
  switch (schema.type) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

/**
 * Extract the path parameter name from a single-item path
 * e.g., "/pets/{petId}" -> "petId"
 */
function extractPathParamName(op: ParsedOperation): string | undefined {
  // First try to get from the parsed pathParams array
  if (op.pathParams.length > 0) {
    return op.pathParams[0]?.name;
  }

  // Fallback: extract from the path string itself
  const match = op.path.match(/\{([^}]+)\}$/);
  return match?.[1];
}

/**
 * Find CRUD mutations for an entity based on path patterns
 */
function findCrudMutations(
  listPath: string,
  operations: ParsedOperation[],
  _entityName: string,
): CollectionMutation[] {
  const mutations: CollectionMutation[] = [];

  // Base path is the list path (e.g., /pets)
  const basePath = listPath;

  // Pattern for single item path (e.g., /pets/{id}, /pets/{petId})
  const singleItemPattern = new RegExp(
    `^${escapeRegex(basePath)}/\\{[^}]+\\}$`,
  );

  for (const op of operations) {
    // Check for POST on the base path (create/insert)
    if (op.method === "post" && op.path === basePath) {
      mutations.push({
        type: "insert",
        operationName: op.operationId,
        inputTypeName: getInputTypeName(op),
      });
    }

    // Check for PUT/PATCH on single item path (update)
    if (
      (op.method === "put" || op.method === "patch") &&
      singleItemPattern.test(op.path)
    ) {
      mutations.push({
        type: "update",
        operationName: op.operationId,
        inputTypeName: getInputTypeName(op),
        pathParamName: extractPathParamName(op),
      });
    }

    // Check for DELETE on single item path (delete)
    if (op.method === "delete" && singleItemPattern.test(op.path)) {
      mutations.push({
        type: "delete",
        operationName: op.operationId,
        pathParamName: extractPathParamName(op),
      });
    }
  }

  return mutations;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get input type name from an operation's request body
 */
function getInputTypeName(op: ParsedOperation): string | undefined {
  if (!op.requestBody) return undefined;

  // Use operation ID to derive input type name
  return `${toPascalCase(op.operationId)}Input`;
}

// =============================================================================
// Code Generation
// =============================================================================

/**
 * Generate TanStack DB collection options code for OpenAPI
 */
export function generateOpenAPICollections(
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

  // Import params types for on-demand entities (these are actually used in predicate translators)
  const paramsTypeNames = entities
    .filter(needsPredicateTranslation)
    .map((e) => e.listQuery.paramsTypeName)
    .filter((name): name is string => !!name)
    .sort();

  lines.push("");
  lines.push(
    `import type { ${typeImports.join(", ")} } from "@tanstack/react-query"`,
  );

  if (paramsTypeNames.length > 0) {
    lines.push(
      `import type { ${paramsTypeNames.join(", ")} } from "${options.typesImportPath}"`,
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
          "openapi",
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

  // Generate queryFn based on sync mode
  const selectorPath = entity.listQuery.selectorPath;
  if (isOnDemand) {
    lines.push(`      syncMode: "on-demand",`);
    lines.push(`      queryFn: async (ctx) => {`);
    lines.push(
      `        const params = ${translatorFn}(ctx.meta?.loadSubsetOptions)`,
    );
    if (selectorPath) {
      lines.push(`        const response = await ${listQueryFn}(params)`);
      lines.push(`        return response.${selectorPath}`);
    } else {
      lines.push(`        return ${listQueryFn}(params)`);
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
    // OpenAPI functions use { body: ... } signature
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${insertFn}({ body: m.modified })))`,
    );
    lines.push(`      },`);
  }

  if (updateMutation) {
    const updateFn = toCamelCase(updateMutation.operationName);
    // Use pathParamName for the function argument, keyField for accessing the entity value
    const pathParam = updateMutation.pathParamName || entity.keyField;
    lines.push(`      onUpdate: async ({ transaction }) => {`);
    // OpenAPI functions use { pathParam: ..., body: ... } signature
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${updateFn}({ ${pathParam}: m.original.${entity.keyField}, body: m.changes })))`,
    );
    lines.push(`      },`);
  }

  if (deleteMutation) {
    const deleteFn = toCamelCase(deleteMutation.operationName);
    // Use pathParamName for the function argument, keyField for accessing the entity value
    const pathParam = deleteMutation.pathParamName || entity.keyField;
    lines.push(`      onDelete: async ({ transaction }) => {`);
    // OpenAPI functions use { pathParam: ... } signature
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${deleteFn}({ ${pathParam}: m.key })))`,
    );
    lines.push(`      },`);
  }

  lines.push(`    })`);
  lines.push(`  )`);

  return lines.join("\n");
}
