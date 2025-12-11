import { dirname } from "node:path";

import { loadConfig } from "c12";
import { z } from "zod";

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
 * GraphQL source configuration
 */
export const graphqlSourceSchema = z.object({
  /** Unique name for this source (used for output directory) */
  name: sourceNameSchema,
  /** Source type discriminator */
  type: z.literal("graphql"),
  /** GraphQL schema configuration */
  schema: z.object({
    /** GraphQL endpoint URL for introspection */
    url: z.string().url(),
    /** Headers to send with introspection request */
    headers: z.record(z.string()).optional(),
  }),
  /** Glob pattern(s) for GraphQL document files */
  documents: z.union([z.string(), z.array(z.string())]),
  /** Custom scalar type mappings */
  scalars: z.record(z.string()).optional(),
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
  headers: z.record(z.string()).optional(),
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
// Output Configuration
// =============================================================================

/**
 * Output configuration schema (with defaults)
 */
export const outputSchema = z.object({
  /** Output directory for generated files */
  dir: z.string(),
  /** Filename for the generated client (default: client.ts) */
  client: z.string().default("client.ts"),
  /** Filename for the generated types (default: types.ts) */
  types: z.string().default("types.ts"),
  /** Filename for the generated operations (default: operations.ts) */
  operations: z.string().default("operations.ts"),
});

/** Output config after parsing (defaults applied) */
export type OutputConfig = z.output<typeof outputSchema>;

/** Output config input (before defaults are applied) */
export type OutputConfigInput = z.input<typeof outputSchema>;

// =============================================================================
// Main Config Schema (New Format)
// =============================================================================

/**
 * New multi-source configuration schema
 */
export const multiSourceConfigSchema = z.object({
  /** Array of data sources to generate from */
  sources: z
    .array(sourceSchema)
    .min(1, "At least one source is required")
    .refine(
      (sources) => new Set(sources.map((s) => s.name)).size === sources.length,
      "Source names must be unique",
    ),
  /** Output configuration */
  output: outputSchema,
});

export type MultiSourceConfig = z.infer<typeof multiSourceConfigSchema>;

// =============================================================================
// Unified Config Type
// =============================================================================

/**
 * The normalized configuration type used internally (after parsing)
 */
export type TangenConfig = z.output<typeof multiSourceConfigSchema>;

/**
 * Input configuration type (before defaults applied)
 */
export type TangenConfigInput = z.input<typeof multiSourceConfigSchema>;

/**
 * Config schema for validation
 */
export const configSchema = multiSourceConfigSchema;

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
    const errors = result.error.errors
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
	sources: [
		{
			name: "graphql",
			type: "graphql",
			schema: {
				url: "http://localhost:4000/graphql",
				// headers: { "x-api-key": process.env.API_KEY },
			},
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
	output: {
		dir: "./src/generated",
	},
})
`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if the config has multiple sources
 */
export function hasMultipleSources(config: TangenConfig): boolean {
  return config.sources.length > 1;
}

/**
 * Get a source by name
 */
export function getSourceByName(
  config: TangenConfig,
  name: string,
): SourceConfig | undefined {
  return config.sources.find((s) => s.name === name);
}

/**
 * Get all sources of a specific type
 */
export function getSourcesByType<T extends SourceConfig["type"]>(
  config: TangenConfig,
  type: T,
): Extract<SourceConfig, { type: T }>[] {
  return config.sources.filter((s) => s.type === type) as Extract<
    SourceConfig,
    { type: T }
  >[];
}
