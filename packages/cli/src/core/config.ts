import { dirname } from "node:path";

import { loadConfig } from "c12";
import * as z from "zod";

import type { DotenvOptions } from "c12";

/**
 * Options for loading the tangrams config
 */
export interface LoadConfigOptions {
  /** Path to the config file */
  configPath?: string;
  /** Dotenv configuration - true to load .env, false to disable, or DotenvOptions object */
  dotenv?: boolean | DotenvOptions;
}

/**
 * Result of loading the tangrams config
 */
export interface LoadConfigResult {
  /** The validated configuration */
  config: TangramsConfig;
  /** The resolved path to the config file */
  configPath: string;
}

// =============================================================================
// Overrides Configuration Schemas
// =============================================================================

/**
 * Per-collection override configuration
 */
export const collectionOverrideSchema = z.object({
  /** Override the key field for this collection (default: auto-detected 'id' field) */
  keyField: z.string().optional(),
});

export type CollectionOverrideConfig = z.infer<typeof collectionOverrideSchema>;

/**
 * DB-specific overrides
 */
export const dbOverridesSchema = z.object({
  /** Per-collection overrides (key: entity name, value: collection config) */
  collections: z.record(z.string(), collectionOverrideSchema).optional(),
});

export type DbOverridesConfig = z.infer<typeof dbOverridesSchema>;

/**
 * Source-level overrides configuration
 */
export const overridesSchema = z.object({
  /** Custom scalar type mappings (GraphQL only) */
  scalars: z.record(z.string(), z.string()).optional(),
  /** TanStack DB overrides */
  db: dbOverridesSchema.optional(),
});

export type OverridesConfig = z.infer<typeof overridesSchema>;

// =============================================================================
// Generates Configuration Schema
// =============================================================================

/**
 * Generates config - array of TanStack libraries to generate artifacts for
 *
 * Available options:
 * - "query" - TanStack Query (queryOptions, mutationOptions)
 * - "form" - TanStack Form (formOptions with Zod validation)
 * - "db" - TanStack DB (queryCollectionOptions)
 *
 * Note: When "db" is specified, "query" is auto-enabled since DB depends on it.
 * The functions.ts file is automatically generated when query or db is enabled.
 */
export const generatesSchema = z
  .array(z.enum(["query", "form", "db"]))
  .min(1, "At least one generator must be specified (query, form, or db)");

export type GeneratesConfig = z.infer<typeof generatesSchema>;

// =============================================================================
// Source Schemas
// =============================================================================

/**
 * Name pattern for sources - lowercase alphanumeric with hyphens
 */
const sourceNameSchema = z
  .string()
  .min(1, "Source name is required")
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "Source name must be lowercase alphanumeric with hyphens, starting with a letter",
  );

/**
 * GraphQL schema configuration - URL-based (introspection)
 */
export const graphqlSchemaUrlConfig = z.object({
  /** GraphQL endpoint URL for introspection */
  url: z.url(),
  /** Headers to send with introspection request */
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * GraphQL schema configuration - File-based (local SDL files)
 */
export const graphqlSchemaFileConfig = z.object({
  /** Glob pattern(s) for GraphQL schema files (.graphql) */
  file: z.union([z.string(), z.array(z.string())]),
});

/**
 * GraphQL schema configuration - either URL or file-based
 */
export const graphqlSchemaConfig = z.union([
  graphqlSchemaUrlConfig,
  graphqlSchemaFileConfig,
]);

export type GraphQLSchemaUrlConfig = z.infer<typeof graphqlSchemaUrlConfig>;
export type GraphQLSchemaFileConfig = z.infer<typeof graphqlSchemaFileConfig>;
export type GraphQLSchemaConfig = z.infer<typeof graphqlSchemaConfig>;

/**
 * GraphQL source configuration
 */
export const graphqlSourceSchema = z.object({
  /** Unique name for this source (used for output directory) */
  name: sourceNameSchema,
  /** Source type discriminator */
  type: z.literal("graphql"),
  /** GraphQL schema configuration - URL for introspection or file path(s) for local SDL */
  schema: graphqlSchemaConfig,
  /** Glob pattern(s) for GraphQL document files */
  documents: z.union([z.string(), z.array(z.string())]),
  /** What to generate from this source */
  generates: generatesSchema,
  /** Optional overrides for scalars and DB collections */
  overrides: overridesSchema.optional(),
});

export type GraphQLSourceConfig = z.infer<typeof graphqlSourceSchema>;

/**
 * OpenAPI source configuration
 */
export const openApiSourceSchema = z.object({
  /** Unique name for this source (used for output directory) */
  name: sourceNameSchema,
  /** Source type discriminator */
  type: z.literal("openapi"),
  /** OpenAPI spec URL or local file path */
  spec: z.string().min(1, "OpenAPI spec path or URL is required"),
  /** Headers to send when fetching remote spec */
  headers: z.record(z.string(), z.string()).optional(),
  /** Glob patterns for paths to include (e.g., ["/users/**", "/posts/*"]) */
  include: z.array(z.string()).optional(),
  /** Glob patterns for paths to exclude */
  exclude: z.array(z.string()).optional(),
  /** What to generate from this source */
  generates: generatesSchema,
  /** Optional overrides for DB collections */
  overrides: overridesSchema.optional(),
});

export type OpenAPISourceConfig = z.infer<typeof openApiSourceSchema>;

/**
 * Union of all source types
 */
export const sourceSchema = z.discriminatedUnion("type", [
  graphqlSourceSchema,
  openApiSourceSchema,
]);

export type SourceConfig = z.infer<typeof sourceSchema>;

// =============================================================================
// Main Config Schema
// =============================================================================

/**
 * Main tangrams configuration schema (source-centric)
 */
export const tangramsConfigSchema = z.object({
  /** Output directory for all generated files (default: ./src/generated) */
  output: z.string().default("./src/generated"),
  /** Array of data sources to generate from */
  sources: z
    .array(sourceSchema)
    .min(1, "At least one source is required")
    .refine(
      (sources) => new Set(sources.map((s) => s.name)).size === sources.length,
      "Source names must be unique",
    ),
});

// =============================================================================
// Unified Config Type
// =============================================================================

/**
 * The normalized configuration type used internally (after parsing)
 */
export type TangramsConfig = z.output<typeof tangramsConfigSchema>;

/**
 * Input configuration type (before defaults applied)
 */
export type TangramsConfigInput = z.input<typeof tangramsConfigSchema>;

/**
 * Config schema for validation
 */
export const configSchema = tangramsConfigSchema;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper for defining a typed config
 */
export function defineConfig(config: TangramsConfigInput): TangramsConfigInput {
  return config;
}

/**
 * Load and validate the tangrams config file
 */
export async function loadTangramsConfig(
  options: LoadConfigOptions = {},
): Promise<LoadConfigResult> {
  // If a config path is provided, use its directory as cwd for dotenv resolution
  const cwd = options.configPath ? dirname(options.configPath) : undefined;

  const { config, configFile } = await loadConfig<TangramsConfigInput>({
    name: "tangrams",
    cwd,
    configFile: options.configPath,
    rcFile: false,
    globalRc: false,
    dotenv: options.dotenv ?? true,
  });

  if (!config || Object.keys(config).length === 0) {
    throw new Error(
      `No configuration found. Run 'tangrams init' to create a config file, or specify a config file with --config.`,
    );
  }

  // Validate and normalize the config
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration in ${configFile}:\n${errors}`);
  }

  return {
    config: result.data,
    configPath: configFile as string,
  };
}

// =============================================================================
// Default Config Generator
// =============================================================================

/**
 * Generate a config file content
 */
export function generateDefaultConfig(): string {
  return `import { defineConfig } from "tangrams"

export default defineConfig({
	sources: [
		{
			name: "graphql",
			type: "graphql",
			schema: {
				url: "http://localhost:4000/graphql",
				// headers: { "x-api-key": process.env.API_KEY },
			},
			// Or use local schema file(s):
			// schema: {
			// 	file: "./schema.graphql",
			// },
			documents: "./src/graphql/**/*.graphql",
			generates: ["query"],
			// overrides: {
			// 	scalars: { DateTime: "Date" },
			// },
		},
		// {
		// 	name: "api",
		// 	type: "openapi",
		// 	spec: "./openapi.yaml",
		// 	generates: ["query", "form"],
		// },
	],
})
`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalized generates config result
 * Auto-enables query when db is specified
 */
export interface NormalizedGenerates {
  query: boolean;
  form: boolean;
  db: boolean;
}

/**
 * Normalize generates config
 * Auto-enables query when db is specified (db depends on functions which needs types)
 */
export function normalizeGenerates(
  generates: GeneratesConfig,
): NormalizedGenerates {
  const hasDb = generates.includes("db");
  return {
    query: generates.includes("query") || hasDb,
    form: generates.includes("form"),
    db: hasDb,
  };
}

/**
 * Check if a source generates query code
 */
export function sourceGeneratesQuery(source: SourceConfig): boolean {
  const normalized = normalizeGenerates(source.generates);
  return normalized.query;
}

/**
 * Check if a source generates form code
 */
export function sourceGeneratesForm(source: SourceConfig): boolean {
  return source.generates.includes("form");
}

/**
 * Check if a source generates db code (TanStack DB collections)
 */
export function sourceGeneratesDb(source: SourceConfig): boolean {
  return source.generates.includes("db");
}

/**
 * Check if the config has multiple sources
 */
export function hasMultipleSources(config: TangramsConfig): boolean {
  return config.sources.length > 1;
}

/**
 * Get a source by name from the config
 */
export function getSourceByName(
  config: TangramsConfig,
  name: string,
): SourceConfig | undefined {
  return config.sources.find((s) => s.name === name);
}

/**
 * Get all sources of a specific type from the config
 */
export function getSourcesByType<T extends SourceConfig["type"]>(
  config: TangramsConfig,
  type: T,
): Extract<SourceConfig, { type: T }>[] {
  return config.sources.filter((s) => s.type === type) as Extract<
    SourceConfig,
    { type: T }
  >[];
}

/**
 * Get all sources that generate query code
 */
export function getQuerySources(config: TangramsConfig): SourceConfig[] {
  return config.sources.filter(sourceGeneratesQuery);
}

/**
 * Get all sources that generate form code
 */
export function getFormSources(config: TangramsConfig): SourceConfig[] {
  return config.sources.filter(sourceGeneratesForm);
}

/**
 * Get all sources that generate db code (TanStack DB collections)
 */
export function getDbSources(config: TangramsConfig): SourceConfig[] {
  return config.sources.filter(sourceGeneratesDb);
}

/**
 * Get scalars configuration from a source (from overrides)
 */
export function getScalarsFromSource(
  source: SourceConfig,
): Record<string, string> | undefined {
  return source.overrides?.scalars;
}

/**
 * Get DB collection overrides from a source
 */
export function getDbCollectionOverrides(
  source: SourceConfig,
): Record<string, { keyField?: string }> | undefined {
  return source.overrides?.db?.collections;
}
