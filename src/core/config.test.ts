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
      loadTangenConfig(join(testDir, "nonexistent.config.ts")),
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

    await expect(loadTangenConfig(configPath)).rejects.toThrow(
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

    const config = await loadTangenConfig(configPath);

    expect(config.schema.url).toBe("http://localhost:4000/graphql");
    expect(config.documents).toBe("./src/graphql/**/*.graphql");
    expect(config.output.dir).toBe("./src/generated");
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

    const config = await loadTangenConfig(configPath);

    expect(config.output.client).toBe("client.ts");
    expect(config.output.types).toBe("types.ts");
    expect(config.output.operations).toBe("operations.ts");
  });
});
