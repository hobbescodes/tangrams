import type {
  GraphQLSourceConfig,
  OpenAPISourceConfig,
  SourceConfig,
} from "@/core/config";

/**
 * Result of generating a file
 */
export interface GeneratedFile {
  /** The filename (without path) */
  filename: string;
  /** The generated code content */
  content: string;
  /** Any warnings generated during code generation */
  warnings?: string[];
}

/**
 * Options for type generation (GraphQL only - generates TypeScript types)
 */
export interface TypeGenOptions {
  /** Custom scalar type mappings */
  scalars?: Record<string, string>;
}

/**
 * Options for functions generation (standalone fetch functions)
 */
export interface FunctionsGenOptions {
  /** Relative import path to the client file */
  clientImportPath: string;
  /** Relative import path to the types/schema file */
  typesImportPath: string;
}

/**
 * Options for operation generation
 * Note: Functions are always imported from "../functions" (hardcoded)
 */
export interface OperationGenOptions {
  /** Relative import path to the types/schema file */
  typesImportPath: string;
  /** The source name to include in query/mutation keys */
  sourceName: string;
}

/**
 * Options for schema (Zod) generation
 */
export interface SchemaGenOptions {
  /** Custom scalar type mappings (for GraphQL) */
  scalars?: Record<string, string>;
}

/**
 * Options for form options generation
 */
export interface FormGenOptions {
  /** Relative import path to the schema file */
  schemaImportPath: string;
  /** The source name */
  sourceName: string;
}

// =============================================================================
// TanStack DB Collection Types
// =============================================================================

/**
 * Mutation type for collection CRUD operations
 */
export type CollectionMutationType = "insert" | "update" | "delete";

/**
 * Mutation info for a collection entity
 */
export interface CollectionMutation {
  /** The mutation type (insert, update, delete) */
  type: CollectionMutationType;
  /** The operation name/identifier in the source */
  operationName: string;
  /** The input type name for this mutation (if applicable) */
  inputTypeName?: string;
}

/**
 * Entity metadata for collection generation
 */
export interface CollectionEntity {
  /** The entity/model name (e.g., "Pet", "User") */
  name: string;
  /** The TypeScript type name for this entity */
  typeName: string;
  /** The key field for identifying unique entities (e.g., "id", "petId") */
  keyField: string;
  /** The TypeScript type of the key field */
  keyFieldType: string;
  /** The query operation that fetches the list of entities */
  listQuery: {
    /** Operation name */
    operationName: string;
    /** Query key for TanStack Query */
    queryKey: string[];
  };
  /** Available mutations for this entity */
  mutations: CollectionMutation[];
}

/**
 * Result of discovering entities for collection generation
 */
export interface CollectionDiscoveryResult {
  /** Discovered entities that can be used for collections */
  entities: CollectionEntity[];
  /** Warnings encountered during discovery */
  warnings: string[];
}

/**
 * Options for collection generation
 * Note: Functions are always imported from "../functions" (hardcoded)
 */
export interface CollectionGenOptions {
  /** Relative import path to the types/schema file */
  typesImportPath: string;
  /** The source name */
  sourceName: string;
  /** Per-entity overrides from config */
  collectionOverrides?: Record<string, { keyField?: string }>;
}

/**
 * Base interface for all source adapters
 *
 * Each adapter is responsible for:
 * 1. Loading/parsing its schema from the configured source
 * 2. Generating a client for making requests
 * 3. Generating standalone fetch functions
 * 4. Generating TanStack Query operation helpers
 * 5. Generating Zod schemas for validation (OpenAPI always, GraphQL when form/db enabled)
 * 6. Generating TanStack Form options for mutations
 * 7. (GraphQL only) Generating TypeScript types for operations
 */
export interface SourceAdapter<
  TConfig extends SourceConfig = SourceConfig,
  TSchema = unknown,
> {
  /** Unique identifier for this source type (matches config.type) */
  readonly type: TConfig["type"];

  /**
   * Load and parse the schema from the source
   * @param config The source configuration
   * @returns The parsed schema object
   */
  loadSchema(config: TConfig): Promise<TSchema>;

  /**
   * Generate the client file for making requests
   * @param schema The loaded schema
   * @param config The source configuration
   * @returns Generated client file
   */
  generateClient(schema: TSchema, config: TConfig): GeneratedFile;

  /**
   * Generate standalone fetch functions
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Functions generation options
   * @returns Generated functions file
   */
  generateFunctions(
    schema: TSchema,
    config: TConfig,
    options: FunctionsGenOptions,
  ): GeneratedFile;

  /**
   * Generate TanStack Query operation helpers
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Operation generation options
   * @returns Generated operations file
   */
  generateOperations(
    schema: TSchema,
    config: TConfig,
    options: OperationGenOptions,
  ): GeneratedFile;

  /**
   * Generate Zod schemas for validation
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Schema generation options
   * @returns Generated schema file with Zod schemas
   */
  generateSchemas(
    schema: TSchema,
    config: TConfig,
    options: SchemaGenOptions,
  ): GeneratedFile;

  /**
   * Generate TanStack Form options for mutations
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Form generation options
   * @returns Generated form options file
   */
  generateFormOptions(
    schema: TSchema,
    config: TConfig,
    options: FormGenOptions,
  ): GeneratedFile;

  /**
   * Discover entities from the schema for TanStack DB collection generation
   * @param schema The loaded schema
   * @param config The source configuration
   * @param overrides Per-entity config overrides (e.g., custom keyField)
   * @returns Entity metadata for collection generation
   */
  discoverCollectionEntities(
    schema: TSchema,
    config: TConfig,
    overrides?: Record<string, { keyField?: string }>,
  ): CollectionDiscoveryResult;

  /**
   * Generate TanStack DB collection options
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Collection generation options
   * @returns Generated collections file
   */
  generateCollections(
    schema: TSchema,
    config: TConfig,
    options: CollectionGenOptions,
  ): GeneratedFile;
}

/**
 * GraphQL-specific adapter interface
 */
export interface GraphQLAdapter
  extends SourceAdapter<GraphQLSourceConfig, GraphQLAdapterSchema> {
  readonly type: "graphql";

  /**
   * Generate TypeScript types from the schema (GraphQL only)
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Type generation options
   * @returns Generated types file
   */
  generateTypes(
    schema: GraphQLAdapterSchema,
    config: GraphQLSourceConfig,
    options: TypeGenOptions,
  ): GeneratedFile;
}

/**
 * GraphQL adapter schema - includes both the introspected schema and parsed documents
 */
export interface GraphQLAdapterSchema {
  /** The introspected GraphQL schema */
  schema: import("graphql").GraphQLSchema;
  /** Parsed operations and fragments from .graphql files */
  documents: import("@/core/documents").ParsedDocuments;
}

/**
 * OpenAPI-specific adapter interface
 */
export interface OpenAPIAdapter
  extends SourceAdapter<OpenAPISourceConfig, OpenAPIAdapterSchema> {
  readonly type: "openapi";
}

/**
 * OpenAPI adapter schema - the parsed OpenAPI document
 */
export interface OpenAPIAdapterSchema {
  /** The parsed and dereferenced OpenAPI document */
  document:
    | import("openapi-types").OpenAPIV3.Document
    | import("openapi-types").OpenAPIV3_1.Document;
  /** Base URL extracted from the spec */
  baseUrl: string;
}

/**
 * Union of all adapter types
 */
export type AnyAdapter = GraphQLAdapter | OpenAPIAdapter;

/**
 * Map of adapter types to their configs
 */
export interface AdapterConfigMap {
  graphql: GraphQLSourceConfig;
  openapi: OpenAPISourceConfig;
}

/**
 * Map of adapter types to their schemas
 */
export interface AdapterSchemaMap {
  graphql: GraphQLAdapterSchema;
  openapi: OpenAPIAdapterSchema;
}
