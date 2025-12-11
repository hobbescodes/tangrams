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

/**
 * Configuration schema for tangen
 */
export const configSchema = z.object({
  schema: z.object({
    /** GraphQL endpoint URL for introspection */
    url: z.string().url(),
    /** Headers to send with introspection request */
    headers: z.record(z.string()).optional(),
  }),
  /** Custom scalar type mappings */
  scalars: z.record(z.string()).optional(),
  /** Glob pattern(s) for GraphQL document files */
  documents: z.union([z.string(), z.array(z.string())]),
  output: z.object({
    /** Output directory for generated files */
    dir: z.string(),
    /** Filename for the generated client */
    client: z.string().default("client.ts"),
    /** Filename for the generated types */
    types: z.string().default("types.ts"),
    /** Filename for the generated operations */
    operations: z.string().default("operations.ts"),
  }),
});

export type TangenConfig = z.infer<typeof configSchema>;

/**
 * Helper for defining a typed config
 */
export function defineConfig(config: TangenConfig): TangenConfig {
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

  const { config, configFile } = await loadConfig<TangenConfig>({
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

  // Validate the config
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

/**
 * Generate a default config file content
 */
export function generateDefaultConfig(): string {
  return `import { defineConfig } from "tangen"

export default defineConfig({
	schema: {
		url: "http://localhost:4000/graphql",
		// headers: { "x-api-key": process.env.API_KEY },
	},
	// scalars: { DateTime: "Date", JSON: "Record<string, unknown>" },
	documents: "./src/graphql/**/*.graphql",
	output: {
		dir: "./src/generated",
		client: "client.ts",
		types: "types.ts",
		operations: "operations.ts",
	},
})
`;
}
