/**
 * OpenAPI Collection Discovery and Generation
 *
 * Discovers entities from OpenAPI specs for TanStack DB collection generation.
 * Identifies list queries, CRUD mutations, and key fields automatically.
 */

import { toCamelCase, toPascalCase } from "@/utils/naming";

import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
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

type OpenAPISchema = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;

/**
 * Discover entities from an OpenAPI schema for collection generation
 */
export function discoverOpenAPIEntities(
  schema: OpenAPIAdapterSchema,
  operations: ParsedOperation[],
  overrides?: Record<string, { keyField?: string }>,
): CollectionDiscoveryResult {
  const warnings: string[] = [];
  const entities: CollectionEntity[] = [];

  // Find all GET operations that return arrays - these are our list queries
  const listQueries = operations.filter((op) => {
    if (op.method !== "get") return false;
    if (!op.responseSchema) return false;

    // Check if response is an array
    return op.responseSchema.type === "array";
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
  overrides?: Record<string, { keyField?: string }>,
  warnings: string[] = [],
): CollectionEntity | null {
  const responseSchema = listQuery.responseSchema as OpenAPISchema;
  if (!responseSchema || responseSchema.type !== "array") {
    return null;
  }

  // Get the item schema from the array
  const itemSchema = responseSchema.items as OpenAPISchema | undefined;
  if (!itemSchema) {
    warnings.push(
      `Could not determine item type for list query ${listQuery.operationId}`,
    );
    return null;
  }

  // Determine entity name from the path or response schema
  const entityName = inferEntityName(listQuery.path, itemSchema, document);
  if (!entityName) {
    warnings.push(
      `Could not determine entity name for list query ${listQuery.operationId}`,
    );
    return null;
  }

  // Find key field
  const keyFieldOverride = overrides?.[entityName]?.keyField;
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

  return {
    name: entityName,
    typeName,
    keyField,
    keyFieldType,
    listQuery: {
      operationName: listQuery.operationId,
      queryKey: [entityName],
    },
    mutations,
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
      });
    }

    // Check for DELETE on single item path (delete)
    if (op.method === "delete" && singleItemPattern.test(op.path)) {
      mutations.push({
        type: "delete",
        operationName: op.operationId,
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

  // Imports
  lines.push(
    'import { queryCollectionOptions } from "@tanstack/query-db-collection"',
  );
  lines.push('import { createCollection } from "@tanstack/react-db"');
  lines.push("");
  lines.push('import type { QueryClient } from "@tanstack/react-query"');

  // Import types from the types file
  const typeNames = entities.map((e) => e.typeName);
  if (typeNames.length > 0) {
    lines.push(
      `import type { ${typeNames.join(", ")} } from "${options.typesImportPath}"`,
    );
  }

  // Import query/mutation functions from functions.ts
  const queryFnImports = entities.map(
    (e) => `${toCamelCase(e.listQuery.operationName)}`,
  );
  const mutationFnImports = entities.flatMap((e) =>
    e.mutations.map((m) => `${toCamelCase(m.operationName)}`),
  );
  const allFunctionImports = [
    ...new Set([...queryFnImports, ...mutationFnImports]),
  ];

  if (allFunctionImports.length > 0) {
    lines.push(
      `import { ${allFunctionImports.join(", ")} } from "${FUNCTIONS_IMPORT_PATH}"`,
    );
  }

  lines.push("");

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

  lines.push("/**");
  lines.push(` * Collection options for ${entity.name}`);
  lines.push(" */");
  lines.push(`export const ${collectionName} = (queryClient: QueryClient) =>`);
  lines.push(`  createCollection(`);
  lines.push(`    queryCollectionOptions({`);
  lines.push(`      queryKey: ${JSON.stringify(entity.listQuery.queryKey)},`);
  lines.push(`      queryFn: async () => ${listQueryFn}(),`);
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
      `        await Promise.all(transaction.mutations.map((m) => ${insertFn}(m.modified)))`,
    );
    lines.push(`      },`);
  }

  if (updateMutation) {
    const updateFn = toCamelCase(updateMutation.operationName);
    lines.push(`      onUpdate: async ({ transaction }) => {`);
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${updateFn}(m.original.${entity.keyField}, m.changes)))`,
    );
    lines.push(`      },`);
  }

  if (deleteMutation) {
    const deleteFn = toCamelCase(deleteMutation.operationName);
    lines.push(`      onDelete: async ({ transaction }) => {`);
    lines.push(
      `        await Promise.all(transaction.mutations.map((m) => ${deleteFn}(m.key)))`,
    );
    lines.push(`      },`);
  }

  lines.push(`    })`);
  lines.push(`  )`);

  return lines.join("\n");
}
