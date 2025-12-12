import { dirname } from "node:path";

import { loadConfig } from "c12";
import * as z from "zod";

import type { DotenvOptions } from "c12";

/**
 * Options for loading the tangen config
 */
export interface LoadConfigOptions {
  /** Path to the config file */
  configPath?: string;
  /** Dotenv configuration - true to load .env, false to disable, or DotenvOptions object */
  dotenv?: boolean | DotenvOptions;
}

/**
 * Result of loading the tangen config
 */
export interface LoadConfigResult {
  /** The validated configuration */
  config: TangenConfig;
  /** The resolved path to the config file */
  configPath: string;
}

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
  /** Custom scalar type mappings */
  scalars: z.record(z.string(), z.string()).optional(),
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
// Query Files Configuration
// =============================================================================

/**
 * Query-specific file naming configuration (with defaults)
 */
export const queryFilesSchema = z.object({
  /** Filename for the generated client (default: client.ts) */
  client: z.string().default("client.ts"),
  /** Filename for the generated types (default: types.ts) */
  types: z.string().default("types.ts"),
  /** Filename for the generated operations (default: operations.ts) */
  operations: z.string().default("operations.ts"),
});

/** Query files config after parsing (defaults applied) */
export type QueryFilesConfig = z.output<typeof queryFilesSchema>;

/** Query files config input (before defaults are applied) */
export type QueryFilesConfigInput = z.input<typeof queryFilesSchema>;

// =============================================================================
// Query Config Schema (TanStack Query)
// =============================================================================

/**
 * Query-specific configuration schema (for TanStack Query)
 */
export const queryConfigSchema = z.object({
  /** Array of data sources to generate from */
  sources: z
    .array(sourceSchema)
    .min(1, "At least one source is required")
    .refine(
      (sources) => new Set(sources.map((s) => s.name)).size === sources.length,
      "Source names must be unique",
    ),
  /** File naming configuration (optional, has defaults) */
  files: queryFilesSchema.default({
    client: "client.ts",
    types: "types.ts",
    operations: "operations.ts",
  }),
});

export type QueryConfig = z.infer<typeof queryConfigSchema>;

// =============================================================================
// Main Config Schema
// =============================================================================

/**
 * Main tangen configuration schema with library-specific configs
 */
export const tangenConfigSchema = z
  .object({
    /** Output directory for all generated files (default: ./src/generated) */
    output: z.string().default("./src/generated"),
    /** TanStack Query configuration */
    query: queryConfigSchema.optional(),
    // Future: router, form, etc.
  })
  .refine(
    (config) => config.query !== undefined,
    "At least one library must be configured (e.g., query)",
  );

// =============================================================================
// Unified Config Type
// =============================================================================

/**
 * The normalized configuration type used internally (after parsing)
 */
export type TangenConfig = z.output<typeof tangenConfigSchema>;

/**
 * Input configuration type (before defaults applied)
 */
export type TangenConfigInput = z.input<typeof tangenConfigSchema>;

/**
 * Config schema for validation
 */
export const configSchema = tangenConfigSchema;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper for defining a typed config (new multi-source format)
 */
export function defineConfig(config: TangenConfigInput): TangenConfigInput {
  return config;
}

/**
 * Load and validate the tangen config file
 */
export async function loadTangenConfig(
  options: LoadConfigOptions = {},
): Promise<LoadConfigResult> {
  // If a config path is provided, use its directory as cwd for dotenv resolution
  const cwd = options.configPath ? dirname(options.configPath) : undefined;

  const { config, configFile } = await loadConfig<TangenConfigInput>({
    name: "tangen",
    cwd,
    configFile: options.configPath,
    rcFile: false,
    globalRc: false,
    dotenv: options.dotenv ?? true,
  });

  if (!config || Object.keys(config).length === 0) {
    throw new Error(
      `No configuration found. Run 'tangen init' to create a config file, or specify a config file with --config.`,
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
  return `import { defineConfig } from "tangen"

export default defineConfig({
	// output: "./src/generated", // default output directory
	query: {
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
				// 	file: "./schema.graphql", // or ["./schema.graphql", "./extensions/**/*.graphql"]
				// },
				// scalars: { DateTime: "Date", JSON: "Record<string, unknown>" },
				documents: "./src/graphql/**/*.graphql",
			},
			// {
			// 	name: "api",
			// 	type: "openapi",
			// 	spec: "./openapi.yaml", // or "https://api.example.com/openapi.json"
			// 	// include: ["/users/**", "/posts/**"],
			// 	// exclude: ["/internal/**"],
			// },
		],
		// files: { client: "client.ts", types: "types.ts", operations: "operations.ts" },
	},
})
`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if the query config has multiple sources
 */
export function hasMultipleSources(config: QueryConfig): boolean {
  return config.sources.length > 1;
}

/**
 * Get a source by name from the query config
 */
export function getSourceByName(
  config: QueryConfig,
  name: string,
): SourceConfig | undefined {
  return config.sources.find((s) => s.name === name);
}

/**
 * Get all sources of a specific type from the query config
 */
export function getSourcesByType<T extends SourceConfig["type"]>(
  config: QueryConfig,
  type: T,
): Extract<SourceConfig, { type: T }>[] {
  return config.sources.filter((s) => s.type === type) as Extract<
    SourceConfig,
    { type: T }
  >[];
}
