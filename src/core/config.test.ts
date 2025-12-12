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
  queryConfigSchema,
} from "./config";

import type {
  GraphQLSchemaUrlConfig,
  GraphQLSourceConfig,
  QueryConfig,
} from "./config";

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

  // File-based schema configuration tests
  it("validates file-based schema with single file path", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { file: "./schema.graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates file-based schema with glob pattern", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { file: "./schemas/**/*.graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates file-based schema with array of patterns", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { file: ["./schema.graphql", "./extensions/**/*.graphql"] },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails when schema has neither url nor file", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: {},
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("validates file-based schema with scalars", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { file: "./schema.graphql" },
      documents: "./src/graphql/**/*.graphql",
      scalars: { DateTime: "Date" },
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

describe("queryConfigSchema", () => {
  it("validates a query config with single GraphQL source", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("validates a query config with multiple sources", () => {
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
    };
    const result = queryConfigSchema.safeParse(config);
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
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("unique");
    }
  });

  it("fails with empty sources array", () => {
    const config = {
      sources: [],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("applies default value for files.client", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files.client).toBe("client.ts");
    }
  });

  it("applies default value for files.types", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files.types).toBe("types.ts");
    }
  });

  it("applies default value for files.operations", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files.operations).toBe("operations.ts");
    }
  });

  it("applies all default files when files is not specified", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files).toEqual({
        client: "client.ts",
        types: "types.ts",
        operations: "operations.ts",
      });
    }
  });

  it("merges partial files override with defaults", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      files: {
        client: "custom-client.ts",
      },
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files.client).toBe("custom-client.ts");
      expect(result.data.files.types).toBe("types.ts");
      expect(result.data.files.operations).toBe("operations.ts");
    }
  });

  it("allows full files override", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
        },
      ],
      files: {
        client: "my-client.ts",
        types: "my-types.ts",
        operations: "my-operations.ts",
      },
    };
    const result = queryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.files).toEqual({
        client: "my-client.ts",
        types: "my-types.ts",
        operations: "my-operations.ts",
      });
    }
  });
});

describe("configSchema", () => {
  it("validates a config with query configuration", () => {
    const config = {
      query: {
        sources: [
          {
            name: "graphql",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("fails when query is missing", () => {
    const config = {};
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("applies default output directory", () => {
    const config = {
      query: {
        sources: [
          {
            name: "graphql",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output).toBe("./src/generated");
    }
  });

  it("allows custom output directory", () => {
    const config = {
      output: "./custom/output",
      query: {
        sources: [
          {
            name: "graphql",
            type: "graphql",
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output).toBe("./custom/output");
    }
  });
});

describe("defineConfig", () => {
  it("returns the same config object (pass-through)", () => {
    const config = {
      query: {
        sources: [
          {
            name: "graphql" as const,
            type: "graphql" as const,
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
      },
    };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });

  it("preserves custom output directory", () => {
    const config = {
      output: "./my-output",
      query: {
        sources: [
          {
            name: "graphql" as const,
            type: "graphql" as const,
            schema: { url: "http://localhost:4000/graphql" },
            documents: "./src/graphql/**/*.graphql",
          },
        ],
      },
    };
    const result = defineConfig(config);
    expect(result.output).toBe("./my-output");
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

  it("contains query key", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("query:");
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

  it("contains commented output configuration", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// output:");
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

  it("contains commented files configuration", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// files:");
  });
});

describe("utility functions", () => {
  const multiSourceQueryConfig: QueryConfig = {
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
    files: {
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    },
  };

  const singleSourceQueryConfig: QueryConfig = {
    sources: [
      {
        name: "graphql",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
      },
    ],
    files: {
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    },
  };

  describe("hasMultipleSources", () => {
    it("returns true for multiple sources", () => {
      expect(hasMultipleSources(multiSourceQueryConfig)).toBe(true);
    });

    it("returns false for single source", () => {
      expect(hasMultipleSources(singleSourceQueryConfig)).toBe(false);
    });
  });

  describe("getSourceByName", () => {
    it("finds source by name", () => {
      const source = getSourceByName(multiSourceQueryConfig, "users-service");
      expect(source).toBeDefined();
      expect(source?.type).toBe("openapi");
    });

    it("returns undefined for non-existent name", () => {
      const source = getSourceByName(multiSourceQueryConfig, "non-existent");
      expect(source).toBeUndefined();
    });
  });

  describe("getSourcesByType", () => {
    it("returns all sources of a given type", () => {
      const openApiSources = getSourcesByType(
        multiSourceQueryConfig,
        "openapi",
      );
      expect(openApiSources).toHaveLength(2);
      expect(openApiSources.map((s) => s.name)).toEqual([
        "users-service",
        "payments-service",
      ]);
    });

    it("returns empty array when no sources match", () => {
      const openApiSources = getSourcesByType(
        singleSourceQueryConfig,
        "openapi",
      );
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
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      }
    `;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.query?.sources).toHaveLength(1);
    const source = result.config.query?.sources[0];
    expect(source?.type).toBe("graphql");
    const graphqlSource = source as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.url).toBe("http://localhost:4000/graphql");
    expect(graphqlSource.documents).toBe("./src/graphql/**/*.graphql");
    expect(result.config.output).toBe("./src/generated");
    expect(result.configPath).toBe(configPath);
  });

  it("loads and validates a multi-source config file", async () => {
    const validConfig = `
      export default {
        query: {
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
        },
      }
    `;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.query?.sources).toHaveLength(2);
    expect(result.config.query?.sources[0]?.name).toBe("main-api");
    expect(result.config.query?.sources[1]?.name).toBe("users-api");
  });

  it("applies default values to loaded config", async () => {
    const configWithDefaults = `
      export default {
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      }
    `;
    await writeFile(configPath, configWithDefaults, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.output).toBe("./src/generated");
    expect(result.config.query?.files.client).toBe("client.ts");
    expect(result.config.query?.files.types).toBe("types.ts");
    expect(result.config.query?.files.operations).toBe("operations.ts");
  });

  it("loads config with custom output directory", async () => {
    const configWithCustomOutput = `
      export default {
        output: "./custom/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      }
    `;
    await writeFile(configPath, configWithCustomOutput, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.output).toBe("./custom/generated");
  });

  it("loads config with partial files override", async () => {
    const configWithPartialFiles = `
      export default {
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
          files: {
            client: "my-client.ts",
          },
        },
      }
    `;
    await writeFile(configPath, configWithPartialFiles, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.query?.files.client).toBe("my-client.ts");
    expect(result.config.query?.files.types).toBe("types.ts");
    expect(result.config.query?.files.operations).toBe("operations.ts");
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
				query: {
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
				},
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({ configPath });

    const graphqlSource = result.config.query
      ?.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("secret123");
  });

  it("does not load .env when dotenv is false", async () => {
    await writeFile(join(testDir, ".env"), "TEST_API_KEY=secret123", "utf-8");

    const configContent = `
			export default {
				query: {
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
				},
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: false,
    });

    const graphqlSource = result.config.query
      ?.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("fallback");
  });

  it("loads custom env file when specified", async () => {
    await writeFile(
      join(testDir, ".env.local"),
      "TEST_API_KEY=local123",
      "utf-8",
    );

    const configContent = `
			export default {
				query: {
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
				},
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: ".env.local" },
    });

    const graphqlSource = result.config.query
      ?.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("local123");
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
				query: {
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
				},
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: [".env", ".env.local"] },
    });

    const graphqlSource = result.config.query
      ?.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("override");
    expect(schemaConfig.headers?.["x-other"]).toBe("other");
  });
});
