import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configSchema,
  defineConfig,
  generateDefaultConfig,
  generatesArraySchema,
  generatesObjectSchema,
  generatesSchema,
  getFormSources,
  getQuerySources,
  getSourceByName,
  getSourcesByType,
  graphqlSourceSchema,
  hasMultipleSources,
  loadTangenConfig,
  normalizeGenerates,
  openApiSourceSchema,
  sourceGeneratesForm,
  sourceGeneratesQuery,
} from "./config";

import type {
  GraphQLSchemaUrlConfig,
  GraphQLSourceConfig,
  TangenConfig,
} from "./config";

describe("graphqlSourceSchema", () => {
  it("validates a valid GraphQL source", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
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
      generates: ["query"],
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails when generates is missing", () => {
    const source = {
      name: "main-api",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
    };
    const result = graphqlSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });
});

describe("openApiSourceSchema", () => {
  it("validates a valid OpenAPI source with URL", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "https://api.example.com/openapi.json",
      generates: ["query"],
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("validates a valid OpenAPI source with file path", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "./specs/openapi.yaml",
      generates: ["query"],
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
      generates: ["query"],
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(true);
  });

  it("fails with empty spec", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "",
      generates: ["query"],
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });

  it("fails when generates is missing", () => {
    const source = {
      name: "users-api",
      type: "openapi",
      spec: "./specs/openapi.yaml",
    };
    const result = openApiSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
  });
});

describe("generatesSchema", () => {
  describe("array form", () => {
    it("validates generates with query only", () => {
      const result = generatesArraySchema.safeParse(["query"]);
      expect(result.success).toBe(true);
    });

    it("validates generates with form only", () => {
      const result = generatesArraySchema.safeParse(["form"]);
      expect(result.success).toBe(true);
    });

    it("validates generates with both query and form", () => {
      const result = generatesArraySchema.safeParse(["query", "form"]);
      expect(result.success).toBe(true);
    });

    it("fails with empty array", () => {
      const result = generatesArraySchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("fails with invalid generator", () => {
      const result = generatesArraySchema.safeParse(["invalid"]);
      expect(result.success).toBe(false);
    });
  });

  describe("object form", () => {
    it("validates generates with query: true", () => {
      const result = generatesObjectSchema.safeParse({ query: true });
      expect(result.success).toBe(true);
    });

    it("validates generates with form: true", () => {
      const result = generatesObjectSchema.safeParse({ form: true });
      expect(result.success).toBe(true);
    });

    it("validates generates with query options", () => {
      const result = generatesObjectSchema.safeParse({
        query: { files: { client: "custom-client.ts" } },
      });
      expect(result.success).toBe(true);
    });

    it("validates generates with form options", () => {
      const result = generatesObjectSchema.safeParse({
        form: { files: { forms: "custom-forms.ts" } },
      });
      expect(result.success).toBe(true);
    });

    it("validates generates with both query and form", () => {
      const result = generatesObjectSchema.safeParse({
        query: true,
        form: { files: { forms: "forms.ts" } },
      });
      expect(result.success).toBe(true);
    });

    it("fails with empty object", () => {
      const result = generatesObjectSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("union schema", () => {
    it("accepts array form", () => {
      const result = generatesSchema.safeParse(["query"]);
      expect(result.success).toBe(true);
    });

    it("accepts object form", () => {
      const result = generatesSchema.safeParse({ query: true });
      expect(result.success).toBe(true);
    });
  });
});

describe("configSchema", () => {
  it("validates a config with single source", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      ],
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
          generates: ["query"],
        },
        {
          name: "users-service",
          type: "openapi",
          spec: "./specs/users.yaml",
          generates: ["query", "form"],
        },
      ],
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
          generates: ["query"],
        },
        {
          name: "api", // Duplicate!
          type: "openapi",
          spec: "./specs/users.yaml",
          generates: ["query"],
        },
      ],
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("unique");
    }
  });

  it("fails with empty sources array", () => {
    const config = {
      sources: [],
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("fails when sources is missing", () => {
    const config = {};
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("applies default output directory", () => {
    const config = {
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      ],
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
      sources: [
        {
          name: "graphql",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      ],
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
    const generates: ("query" | "form")[] = ["query"];
    const config = {
      sources: [
        {
          name: "graphql" as const,
          type: "graphql" as const,
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates,
        },
      ],
    };
    const result = defineConfig(config);
    expect(result).toEqual(config);
  });

  it("preserves custom output directory", () => {
    const generates: ("query" | "form")[] = ["query"];
    const config = {
      output: "./my-output",
      sources: [
        {
          name: "graphql" as const,
          type: "graphql" as const,
          schema: { url: "http://localhost:4000/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates,
        },
      ],
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

  it("contains sources key", () => {
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

  it("contains generates property", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("generates:");
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
});

describe("normalizeGenerates", () => {
  it("normalizes array form to object form with query", () => {
    const result = normalizeGenerates(["query"]);
    expect(result.query).toBeDefined();
    expect(result.query?.files).toEqual({
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    });
    expect(result.form).toBeUndefined();
  });

  it("normalizes array form to object form with form", () => {
    const result = normalizeGenerates(["form"]);
    expect(result.form).toBeDefined();
    expect(result.form?.files).toEqual({
      forms: "forms.ts",
    });
    expect(result.query).toBeUndefined();
  });

  it("normalizes array form to object form with both", () => {
    const result = normalizeGenerates(["query", "form"]);
    expect(result.query).toBeDefined();
    expect(result.form).toBeDefined();
  });

  it("normalizes object form with query: true", () => {
    const result = normalizeGenerates({ query: true });
    expect(result.query?.files).toEqual({
      client: "client.ts",
      types: "types.ts",
      operations: "operations.ts",
    });
  });

  it("normalizes object form with custom files", () => {
    const result = normalizeGenerates({
      query: { files: { client: "custom.ts" } },
    });
    expect(result.query?.files.client).toBe("custom.ts");
    expect(result.query?.files.types).toBe("types.ts");
    expect(result.query?.files.operations).toBe("operations.ts");
  });

  it("normalizes object form with form: true", () => {
    const result = normalizeGenerates({ form: true });
    expect(result.form?.files).toEqual({
      forms: "forms.ts",
    });
  });

  it("normalizes object form with custom form files", () => {
    const result = normalizeGenerates({
      form: { files: { forms: "custom-forms.ts" } },
    });
    expect(result.form?.files.forms).toBe("custom-forms.ts");
  });
});

describe("utility functions", () => {
  const multiSourceConfig: TangenConfig = {
    output: "./src/generated",
    sources: [
      {
        name: "main-api",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
        generates: ["query"],
      },
      {
        name: "users-service",
        type: "openapi",
        spec: "./specs/users.yaml",
        generates: ["query", "form"],
      },
      {
        name: "payments-service",
        type: "openapi",
        spec: "./specs/payments.yaml",
        generates: { form: true },
      },
    ],
  };

  const singleSourceConfig: TangenConfig = {
    output: "./src/generated",
    sources: [
      {
        name: "graphql",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
        generates: ["query"],
      },
    ],
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

  describe("sourceGeneratesQuery", () => {
    it("returns true for array with query", () => {
      const source = multiSourceConfig.sources[0]!;
      expect(sourceGeneratesQuery(source)).toBe(true);
    });

    it("returns true for array with query and form", () => {
      const source = multiSourceConfig.sources[1]!;
      expect(sourceGeneratesQuery(source)).toBe(true);
    });

    it("returns false for object without query", () => {
      const source = multiSourceConfig.sources[2]!;
      expect(sourceGeneratesQuery(source)).toBe(false);
    });
  });

  describe("sourceGeneratesForm", () => {
    it("returns false for array without form", () => {
      const source = multiSourceConfig.sources[0]!;
      expect(sourceGeneratesForm(source)).toBe(false);
    });

    it("returns true for array with form", () => {
      const source = multiSourceConfig.sources[1]!;
      expect(sourceGeneratesForm(source)).toBe(true);
    });

    it("returns true for object with form", () => {
      const source = multiSourceConfig.sources[2]!;
      expect(sourceGeneratesForm(source)).toBe(true);
    });
  });

  describe("getQuerySources", () => {
    it("returns sources that generate query code", () => {
      const sources = getQuerySources(multiSourceConfig);
      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.name)).toEqual(["main-api", "users-service"]);
    });
  });

  describe("getFormSources", () => {
    it("returns sources that generate form code", () => {
      const sources = getFormSources(multiSourceConfig);
      expect(sources).toHaveLength(2);
      expect(sources.map((s) => s.name)).toEqual([
        "users-service",
        "payments-service",
      ]);
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
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.sources).toHaveLength(1);
    const source = result.config.sources[0];
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
				sources: [
					{
						name: "main-api",
						type: "graphql",
						schema: { url: "http://localhost:4000/graphql" },
						documents: "./src/graphql/**/*.graphql",
						generates: ["query"],
					},
					{
						name: "users-api",
						type: "openapi",
						spec: "./specs/users.yaml",
						generates: ["query", "form"],
					},
				],
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
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configWithDefaults, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.output).toBe("./src/generated");
  });

  it("loads config with custom output directory", async () => {
    const configWithCustomOutput = `
			export default {
				output: "./custom/generated",
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: { url: "http://localhost:4000/graphql" },
						documents: "./src/graphql/**/*.graphql",
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configWithCustomOutput, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.output).toBe("./custom/generated");
  });

  it("loads config with generates object form", async () => {
    const configWithGeneratesObject = `
			export default {
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: { url: "http://localhost:4000/graphql" },
						documents: "./src/graphql/**/*.graphql",
						generates: {
							query: { files: { client: "my-client.ts" } },
						},
					},
				],
			}
		`;
    await writeFile(configPath, configWithGeneratesObject, "utf-8");

    const result = await loadTangenConfig({ configPath });

    const source = result.config.sources[0];
    // normalizeGenerates fills in defaults for missing files
    expect(source?.generates).toEqual({
      query: {
        files: {
          client: "my-client.ts",
          operations: "operations.ts",
          types: "types.ts",
        },
      },
    });
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
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({ configPath });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("secret123");
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
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: false,
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
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
				sources: [
					{
						name: "graphql",
						type: "graphql",
						schema: {
							url: "http://localhost:4000/graphql",
							headers: { "x-api-key": process.env.TEST_API_KEY },
						},
						documents: "./src/graphql/**/*.graphql",
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: ".env.local" },
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
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
						generates: ["query"],
					},
				],
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: [".env", ".env.local"] },
    });

    const graphqlSource = result.config.sources[0] as GraphQLSourceConfig;
    const schemaConfig = graphqlSource.schema as GraphQLSchemaUrlConfig;
    expect(schemaConfig.headers?.["x-api-key"]).toBe("override");
    expect(schemaConfig.headers?.["x-other"]).toBe("other");
  });
});
