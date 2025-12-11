import { loadConfig } from "c12";
import { z } from "zod";

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

  client: z
    .object({
      /** Headers to include in the generated client */
      headers: z.record(z.string()).optional(),
    })
    .optional(),

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
  configPath?: string,
): Promise<TangenConfig> {
  const { config, configFile } = await loadConfig<TangenConfig>({
    name: "tangen",
    configFile: configPath,
    rcFile: false,
    globalRc: false,
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

  return result.data;
}

/**
 * Generate a default config file content
 */
export function generateDefaultConfig(): string {
  return `import { defineConfig } from "tangen"

export default defineConfig({
	schema: {
		url: "http://localhost:4000/graphql",
		// Headers for introspection (e.g., API keys)
		// headers: {
		//   "x-api-key": process.env.API_KEY,
		// },
	},

	client: {
		// Headers to include in the generated client
		headers: {
			"Content-Type": "application/json",
		},
	},

	// Custom scalar type mappings
	// scalars: {
	//   DateTime: "Date",
	//   JSON: "Record<string, unknown>",
	// },

	// Glob pattern for your GraphQL operation files
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
