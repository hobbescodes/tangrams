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
 * Options for operation generation
 */
export interface OperationGenOptions {
  /** Relative import path to the client file */
  clientImportPath: string;
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

/**
 * Base interface for all source adapters
 *
 * Each adapter is responsible for:
 * 1. Loading/parsing its schema from the configured source
 * 2. Generating a client for making requests
 * 3. Generating TanStack Query operation helpers
 * 4. Generating Zod schemas for validation (OpenAPI always, GraphQL when form enabled)
 * 5. Generating TanStack Form options for mutations
 * 6. (GraphQL only) Generating TypeScript types for operations
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
