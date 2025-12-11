import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configSchema,
  defineConfig,
  generateDefaultConfig,
  loadTangenConfig,
} from "./config";

describe("configSchema", () => {
  const validConfig = {
    schema: {
      url: "http://localhost:4000/graphql",
    },
    documents: "./src/graphql/**/*.graphql",
    output: {
      dir: "./src/generated",
    },
  };

  it("validates a valid configuration", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("validates configuration with all optional fields", () => {
    const fullConfig = {
      schema: {
        url: "http://localhost:4000/graphql",
        headers: { "x-api-key": "test-key" },
      },
      scalars: { DateTime: "Date" },
      documents: "./src/graphql/**/*.graphql",
      output: {
        dir: "./src/generated",
        client: "custom-client.ts",
        types: "custom-types.ts",
        operations: "custom-operations.ts",
      },
    };
    const result = configSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
  });

  it("validates configuration with array of document patterns", () => {
    const config = {
      ...validConfig,
      documents: ["./src/graphql/**/*.graphql", "./src/queries/**/*.gql"],
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("fails when schema.url is missing", () => {
    const config = {
      schema: {},
      documents: "./src/graphql/**/*.graphql",
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("fails when schema.url is invalid", () => {
    const config = {
      schema: { url: "not-a-valid-url" },
      documents: "./src/graphql/**/*.graphql",
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("fails when documents is missing", () => {
    const config = {
      schema: { url: "http://localhost:4000/graphql" },
      output: { dir: "./src/generated" },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("fails when output.dir is missing", () => {
    const config = {
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      output: {},
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("applies default value for output.client", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.client).toBe("client.ts");
    }
  });

  it("applies default value for output.types", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.types).toBe("types.ts");
    }
  });

  it("applies default value for output.operations", () => {
    const result = configSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.output.operations).toBe("operations.ts");
    }
  });

  it("allows headers to be a record of strings", () => {
    const config = {
      ...validConfig,
      schema: {
        url: "http://localhost:4000/graphql",
        headers: {
          "x-api-key": "key",
          Authorization: "Bearer token",
        },
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("allows scalars to be a record of strings", () => {
    const config = {
      ...validConfig,
      scalars: {
        DateTime: "Date",
        JSON: "Record<string, unknown>",
      },
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe("defineConfig", () => {
  it("returns the same config object (pass-through)", () => {
    const config = {
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      output: {
        dir: "./src/generated",
        client: "client.ts",
        types: "types.ts",
        operations: "operations.ts",
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
    expect(result).toContain("client:");
    expect(result).toContain("types:");
    expect(result).toContain("operations:");
  });

  it("contains commented headers example", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// headers:");
  });

  it("contains commented scalars example", () => {
    const result = generateDefaultConfig();
    expect(result).toContain("// scalars:");
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
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      }
    `;
    await writeFile(configPath, validConfig, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.schema.url).toBe("http://localhost:4000/graphql");
    expect(result.config.documents).toBe("./src/graphql/**/*.graphql");
    expect(result.config.output.dir).toBe("./src/generated");
    expect(result.configPath).toBe(configPath);
  });

  it("applies default values to loaded config", async () => {
    const configWithDefaults = `
      export default {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
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
				schema: {
					url: "http://localhost:4000/graphql",
					headers: { "x-api-key": process.env.TEST_API_KEY },
				},
				documents: "./src/graphql/**/*.graphql",
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({ configPath });

    expect(result.config.schema.headers?.["x-api-key"]).toBe("secret123");
  });

  it("does not load .env when dotenv is false", async () => {
    await writeFile(join(testDir, ".env"), "TEST_API_KEY=secret123", "utf-8");

    const configContent = `
			export default {
				schema: {
					url: "http://localhost:4000/graphql",
					headers: { "x-api-key": process.env.TEST_API_KEY || "fallback" },
				},
				documents: "./src/graphql/**/*.graphql",
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: false,
    });

    expect(result.config.schema.headers?.["x-api-key"]).toBe("fallback");
  });

  it("loads custom env file when specified", async () => {
    await writeFile(
      join(testDir, ".env.local"),
      "TEST_API_KEY=local123",
      "utf-8",
    );

    const configContent = `
			export default {
				schema: {
					url: "http://localhost:4000/graphql",
					headers: { "x-api-key": process.env.TEST_API_KEY },
				},
				documents: "./src/graphql/**/*.graphql",
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: ".env.local" },
    });

    expect(result.config.schema.headers?.["x-api-key"]).toBe("local123");
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
				schema: {
					url: "http://localhost:4000/graphql",
					headers: {
						"x-api-key": process.env.TEST_API_KEY,
						"x-other": process.env.OTHER_VAR,
					},
				},
				documents: "./src/graphql/**/*.graphql",
				output: { dir: "./src/generated" },
			}
		`;
    await writeFile(configPath, configContent, "utf-8");

    const result = await loadTangenConfig({
      configPath,
      dotenv: { fileName: [".env", ".env.local"] },
    });

    expect(result.config.schema.headers?.["x-api-key"]).toBe("override");
    expect(result.config.schema.headers?.["x-other"]).toBe("other");
  });
});
