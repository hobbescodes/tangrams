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
// File Configuration Schemas
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

/**
 * Form-specific file naming configuration (with defaults)
 */
export const formFilesSchema = z.object({
  /** Filename for the generated form options (default: forms.ts) */
  forms: z.string().default("forms.ts"),
});

/** Form files config after parsing (defaults applied) */
export type FormFilesConfig = z.output<typeof formFilesSchema>;

/** Form files config input (before defaults are applied) */
export type FormFilesConfigInput = z.input<typeof formFilesSchema>;

// =============================================================================
// Generates Configuration Schemas
// =============================================================================

/**
 * Query generation options (per-source)
 */
export const queryGenerateOptionsSchema = z.object({
  /** File naming configuration */
  files: queryFilesSchema.optional(),
});

/**
 * Form generation options (per-source)
 */
export const formGenerateOptionsSchema = z.object({
  /** File naming configuration */
  files: formFilesSchema.optional(),
});

/**
 * Generates config as object (for customization)
 */
export const generatesObjectSchema = z
  .object({
    /** TanStack Query generation options */
    query: z.union([z.literal(true), queryGenerateOptionsSchema]).optional(),
    /** TanStack Form generation options */
    form: z.union([z.literal(true), formGenerateOptionsSchema]).optional(),
  })
  .refine(
    (obj) => obj.query !== undefined || obj.form !== undefined,
    "At least one generator must be specified (query or form)",
  );

/**
 * Generates config as array (simple form)
 */
export const generatesArraySchema = z
  .array(z.enum(["query", "form"]))
  .min(1, "At least one generator must be specified");

/**
 * Combined generates schema - supports both array and object forms
 *
 * Examples:
 * - Simple: `generates: ["query", "form"]`
 * - With options: `generates: { query: { files: { client: "custom.ts" } }, form: true }`
 */
export const generatesSchema = z.union([
  generatesArraySchema,
  generatesObjectSchema,
]);

export type GeneratesConfig = z.infer<typeof generatesSchema>;
export type GeneratesConfigInput = z.input<typeof generatesSchema>;
export type GeneratesObjectConfig = z.infer<typeof generatesObjectSchema>;

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
  /** What to generate from this source */
  generates: generatesSchema,
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
 * Main tangen configuration schema (source-centric)
 */
export const tangenConfigSchema = z.object({
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
 * Helper for defining a typed config
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
			documents: "./src/graphql/**/*.graphql",
			// scalars: { DateTime: "Date", JSON: "Record<string, unknown>" },
			generates: ["query"], // or { query: { files: { client: "custom.ts" } } }
		},
		// {
		// 	name: "api",
		// 	type: "openapi",
		// 	spec: "./openapi.yaml", // or "https://api.example.com/openapi.json"
		// 	// include: ["/users/**", "/posts/**"],
		// 	// exclude: ["/internal/**"],
		// 	generates: ["query", "form"], // generate both query and form options
		// },
	],
})
`;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize generates config to object form
 * Converts array form ["query", "form"] to object form { query: {}, form: {} }
 */
export function normalizeGenerates(
  generates: GeneratesConfig | GeneratesConfigInput,
): {
  query?: { files: QueryFilesConfig };
  form?: { files: FormFilesConfig };
} {
  // Array form: ["query", "form"]
  if (Array.isArray(generates)) {
    const result: {
      query?: { files: QueryFilesConfig };
      form?: { files: FormFilesConfig };
    } = {};

    if (generates.includes("query")) {
      result.query = {
        files: {
          client: "client.ts",
          types: "types.ts",
          operations: "operations.ts",
        },
      };
    }

    if (generates.includes("form")) {
      result.form = {
        files: { forms: "forms.ts" },
      };
    }

    return result;
  }

  // Object form: { query: { files: ... }, form: true }
  const result: {
    query?: { files: QueryFilesConfig };
    form?: { files: FormFilesConfig };
  } = {};

  if (generates.query) {
    const queryConfig =
      generates.query === true ? {} : (generates.query as { files?: unknown });
    const filesInput = queryConfig.files as QueryFilesConfigInput | undefined;
    result.query = {
      files: {
        client: filesInput?.client ?? "client.ts",
        types: filesInput?.types ?? "types.ts",
        operations: filesInput?.operations ?? "operations.ts",
      },
    };
  }

  if (generates.form) {
    const formConfig =
      generates.form === true ? {} : (generates.form as { files?: unknown });
    const filesInput = formConfig.files as FormFilesConfigInput | undefined;
    result.form = {
      files: {
        forms: filesInput?.forms ?? "forms.ts",
      },
    };
  }

  return result;
}

/**
 * Check if a source generates query code
 */
export function sourceGeneratesQuery(source: SourceConfig): boolean {
  if (Array.isArray(source.generates)) {
    return source.generates.includes("query");
  }
  return source.generates.query !== undefined;
}

/**
 * Check if a source generates form code
 */
export function sourceGeneratesForm(source: SourceConfig): boolean {
  if (Array.isArray(source.generates)) {
    return source.generates.includes("form");
  }
  return source.generates.form !== undefined;
}

/**
 * Check if the config has multiple sources
 */
export function hasMultipleSources(config: TangenConfig): boolean {
  return config.sources.length > 1;
}

/**
 * Get a source by name from the config
 */
export function getSourceByName(
  config: TangenConfig,
  name: string,
): SourceConfig | undefined {
  return config.sources.find((s) => s.name === name);
}

/**
 * Get all sources of a specific type from the config
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

/**
 * Get all sources that generate query code
 */
export function getQuerySources(config: TangenConfig): SourceConfig[] {
  return config.sources.filter(sourceGeneratesQuery);
}

/**
 * Get all sources that generate form code
 */
export function getFormSources(config: TangenConfig): SourceConfig[] {
  return config.sources.filter(sourceGeneratesForm);
}
