import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configSchema,
  defineConfig,
  generateDefaultConfig,
  getSourceByName,
  getSourcesByType,
  graphqlSourceSchema,
  hasMultipleSources,
  loadTangenConfig,
  openApiSourceSchema,
} from "./config";

import type { GraphQLSourceConfig, TangenConfig } from "./config";

describe("graphqlSourceSchema", () => {
  it("validates a valid GraphQL source", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates with optional scalars", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      scalars: { DateTime: "Date" },
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails with invalid name format", () => {
    const source = {
      name: "MainAPI", // Invalid: uppercase
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("fails with name starting with number", () => {
    const source = {
      name: "1api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("allows hyphens in name", () => {
    const source = {
      name: "main-api-v2",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates configuration with array of document patterns", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: ["./src/graphql/**/*.graphql", "./src/queries/**/*.gql"],
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails when schema.url is missing", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: {},
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("fails when schema.url is invalid", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "not-a-valid-url" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("allows headers to be a record of strings", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: {
        url: "http://localhost:4000/graphql",
        headers: {
          "x-api-key": "key",
          Authorization: "Bearer token",
        },
      },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("allows scalars to be a record of strings", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      scalars: {
        DateTime: "Date",
        JSON: "Record<string, unknown>",
      },
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });
});

describe("openApiSourceSchema", () => {
  it("validates a valid OpenAPI source with URL", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "https://api.example.com/openapi.json",
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates a valid OpenAPI source with file path", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "./specs/openapi.yaml",
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates with include/exclude patterns", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "./specs/openapi.yaml",
      include: ["/users/**", "/auth/**"],
      exclude: ["/internal/**"],
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails with empty spec", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "",
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });
});

describe("configSchema", () => {
  it("validates a config with single GraphQL source", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates a config with multiple sources", () => {
    const config = {
      sources: [
        {
          name: "main-api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
        {
          name: "users-service",
          type: "openapi",
          spec: "./specs/users.yaml",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("fails with duplicate source names", () => {
    const config = {
      sources: [
        {
          name: "api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
        {
          name: "api", // Duplicate!
          type: "openapi",
          spec: "./specs/users.yaml",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain("unique");
    }
  });

  it("fails with empty sources array", () => {
    const config = {
      sources: [],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("applies default value for output.client", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.client).toBe("client.ts");
    }
  });

  it("applies default value for output.types", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.types).toBe("types.ts");
    }
  });

  it("applies default value for output.operations", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.operations).toBe("operations.ts");
    }
  });
});

describe("defineConfig", () => {
  it("returns the same config object (pass-through)", () => {
    const config = {
      sources: [
        {
          name: "graphql" as const,
          type: "graphql" as const,
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      output: {
        dir: "./src/generated",
      },
    };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });
});

describe("generateDefaultConfig", () => {
  it("returns a non-empty string", () => {
    const result = generateDefaultConfig();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("contains defineConfig import", () => {
    const result = generateDefaultConfig();
    expect(result).toContain('import { defineConfig } from "tangen"');
  });

  it("contains sources array", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("sources:");
  });

  it("contains GraphQL source type", () => {
    const result = generateDefaultConfig();
    expect(result).toContain('type: "graphql"');
  });

  it("contains schema.url placeholder", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("http://localhost:4000/graphql");
  });

  it("contains documents pattern", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("documents:");
    expect(result).toContain(".graphql");
  });

  it("contains output configuration", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("output:");
    expect(result).toContain("dir:");
  });

  it("contains commented headers example", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// headers:");
  });

  it("contains commented scalars example", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// scalars:");
  });

  it("contains commented OpenAPI source example", () => {
    const result = generateDefaultConfig();
    expect(result).toContain('// 	type: "openapi"');
    expect(result).toContain("// 	spec:");
  });
});

describe("utility functions", () => {
  const multiSourceConfig: TangenConfig = {
    sources: [
      {
        name: "main-api",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
      },
      {
        name: "users-service",
        type: "openapi",
        spec: "./specs/users.yaml",
      },
      {
        name: "payments-service",
        type: "openapi",
        spec: "./specs/payments.yaml",
      },
    ],
    output: {
      dir: "./src/generated",
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    },
  };

  const singleSourceConfig: TangenConfig = {
    sources: [
      {
        name: "graphql",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
      },
    ],
    output: {
      dir: "./src/generated",
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    },
  };

  describe("hasMultipleSources", () => {
    it("returns true for multiple sources", () => {
      expect(hasMultipleSources(multiSourceConfig)).toBe(true);
    });

    it("returns false for single source", () => {
      expect(hasMultipleSources(singleSourceConfig)).toBe(false);
    });
  });

  describe("getSourceByName", () => {
    it("finds source by name", () => {
      const source = getSourceByName(multiSourceConfig, "users-service");
      expect(source).toBeDefined();
      expect(source?.type).toBe("openapi");
    });

    it("returns undefined for non-existent name", () => {
      const source = getSourceByName(multiSourceConfig, "non-existent");
      expect(source).toBeUndefined();
    });
  });

  describe("getSourcesByType", () => {
    it("returns all sources of a given type", () => {
      const openApiSources = getSourcesByType(multiSourceConfig, "openapi");
      expect(openApiSources).toHaveLength(2);
      expect(openApiSources.map((s) => s.name)).toEqual([
        "users-service",
        "payments-service",
      ]);
    });

    it("returns empty array when no sources match", () => {
      const openApiSources = getSourcesByType(singleSourceConfig, "openapi");
      expect(openApiSources).toHaveLength(0);
    });
  });
});

describe("loadTangenConfig", () => {
  const testDir = join(__dirname, ".test-config");
  const configPath = join(testDir, "tangen.config.ts");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("throws when no config file exists", async () => {
    await expect(
      loadTangenConfig({
        configPath: join(testDir, "nonexistent.config.ts"),
      }),
    ).rejects.toThrow("No configuration found");
  });

  it("throws when config is invalid", async () => {
    // Create an invalid config file (missing required fields)
    const invalidConfig = `
      export default {
        schema: {},
        output: {}
      }
    `;
    await writeFile(configPath, invalidConfig, "utf-8");

    await expect(loadTangenConfig({ configPath })).rejects.toThrow(
      "Invalid configuration",
    );
  });

  it("loads and validates a valid config file", async () => {
    const validConfig = `
      export default {
        sources: [
          {
            name: "graphql",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
        output: {
          dir: "./src/generated",
        },
      }
    `;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.sources).toHaveLength(1);
    const source = result.config.sources[0];
    expect(source?.type).toBe("graphql");
    const graphqlSource = source as GraphQLSourceConfig;
    expect(graphqlSource.schema.url).toBe("http://localhost:4000/graphql");
    expect(graphqlSource.documents).toBe("./src/graphql/**/*.graphql");
    expect(result.config.output.dir).toBe("./src/generated");
    expect(result.configPath).toBe(configPath);
  });

  it("loads and validates a multi-source config file", async () => {
    const validConfig = `
      export default {
        sources: [
          {
            name: "main-api",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
          {
            name: "users-api",
            type: "openapi",
            spec: "./specs/users.yaml",
          },
        ],
        output: {
          dir: "./src/generated",
        },
      }
    `;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.sources).toHaveLength(2);
    expect(result.config.sources[0]?.name).toBe("main-api");
    expect(result.config.sources[1]?.name).toBe("users-api");
  });

  it("applies default values to loaded config", async () => {
    const configWithDefaults = `
      export default {
        sources: [
          {
            name: "graphql",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
        output: {
          dir: "./src/generated",
        },
      }
    `;
    await writeFile(configPath, configWithDefaults, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.output.client).toBe("client.ts");
    expect(result.config.output.types).toBe("types.ts");
    expect(result.config.output.operations).toBe("operations.ts");
  });
});

describe("loadTangenConfig with dotenv", () => {
  const testDir = join(__dirname, ".test-config-dotenv");
  const configPath = join(testDir, "tangen.config.ts");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    // Store original env values
    delete process.env.TEST_API_KEY;
    delete process.env.OTHER_VAR;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    // Clean up env vars
    delete process.env.TEST_API_KEY;
    delete process.env.OTHER_VAR;
  });

  it("loads .env file by default and makes vars available to config", async () => {
    // Create .env file
    await writeFile(join(testDir, ".env"), "TEST_API_KEY=secret123", "utf-8");

    // Create config that uses env var
    const configContent = `
			export default {
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: {
							url: "http://localhost:4000/graphql",
							headers: { "x-api-key": process.env.TEST_API_KEY },
						},
						documents: "./src/graphql/**/*.graphql",
					},
				],
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({ configPath });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    expect(graphqlSource.schema.headers?.["x-api-key"]).toBe("secret123");
  });

  it("does not load .env when dotenv is false", async () => {
    await writeFile(join(testDir, ".env"), "TEST_API_KEY=secret123", "utf-8");

    const configContent = `
			export default {
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: {
							url: "http://localhost:4000/graphql",
							headers: { "x-api-key": process.env.TEST_API_KEY || "fallback" },
						},
						documents: "./src/graphql/**/*.graphql",
					},
				],
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: false,
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    expect(graphqlSource.schema.headers?.["x-api-key"]).toBe("fallback");
  });

  it("loads custom env file when specified", async () => {
    await writeFile(
      join(testDir, ".env.local"),
      "TEST_API_KEY=local123",
      "utf-8",
    );

    const configContent = `
			export default {
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: {
							url: "http://localhost:4000/graphql",
							headers: { "x-api-key": process.env.TEST_API_KEY },
						},
						documents: "./src/graphql/**/*.graphql",
					},
				],
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: ".env.local" },
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    expect(graphqlSource.schema.headers?.["x-api-key"]).toBe("local123");
  });

  it("merges multiple env files with later files taking priority", async () => {
    await writeFile(
      join(testDir, ".env"),
      "TEST_API_KEY=base\nOTHER_VAR=other",
      "utf-8",
    );
    await writeFile(
      join(testDir, ".env.local"),
      "TEST_API_KEY=override",
      "utf-8",
    );

    const configContent = `
			export default {
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: {
							url: "http://localhost:4000/graphql",
							headers: {
								"x-api-key": process.env.TEST_API_KEY,
								"x-other": process.env.OTHER_VAR,
							},
						},
						documents: "./src/graphql/**/*.graphql",
					},
				],
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: [".env", ".env.local"] },
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    expect(graphqlSource.schema.headers?.["x-api-key"]).toBe("override");
    expect(graphqlSource.schema.headers?.["x-other"]).toBe("other");
  });
});
