import type {
  GraphQLSourceConfig,
  OpenAPISourceConfig,
  QueryConfig,
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
 * Options for type generation
 */
export interface TypeGenOptions {
  /** Custom scalar type mappings (GraphQL-specific but may apply to other sources) */
  scalars?: Record<string, string>;
}

/**
 * Options for operation generation
 */
export interface OperationGenOptions {
  /** Relative import path to the client file */
  clientImportPath: string;
  /** Relative import path to the types file */
  typesImportPath: string;
  /** The source name to include in query/mutation keys */
  sourceName: string;
}

/**
 * Context passed to the adapter during generation
 */
export interface GenerationContext {
  /** The query config */
  queryConfig: QueryConfig;
  /** The output directory for this source */
  outputDir: string;
}

/**
 * Base interface for all source adapters
 *
 * Each adapter is responsible for:
 * 1. Loading/parsing its schema from the configured source
 * 2. Generating TypeScript types from the schema
 * 3. Generating a client for making requests
 * 4. Generating TanStack Query operation helpers
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
   * @param context Generation context
   * @returns Generated client file
   */
  generateClient(
    schema: TSchema,
    config: TConfig,
    context: GenerationContext,
  ): GeneratedFile;

  /**
   * Generate TypeScript types from the schema
   * @param schema The loaded schema
   * @param config The source configuration
   * @param options Type generation options
   * @returns Generated types file
   */
  generateTypes(
    schema: TSchema,
    config: TConfig,
    options: TypeGenOptions,
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
}

/**
 * GraphQL-specific adapter interface
 */
export interface GraphQLAdapter
  extends SourceAdapter<GraphQLSourceConfig, GraphQLAdapterSchema> {
  readonly type: "graphql";
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
