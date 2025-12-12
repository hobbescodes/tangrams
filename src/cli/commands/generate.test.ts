import { describe, expect, it } from "vitest";

import { configSchema, graphqlSourceSchema } from "../../core/config";
import { generateCommand } from "./generate";

// We test the config loading and validation logic
// rather than the citty command to avoid mocking process.exit()

describe("generate command logic", () => {
  describe("config validation", () => {
    it("validates a valid configuration", () => {
      const config = {
        output: "./src/generated",
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

    it("rejects invalid configuration", () => {
      const config = {
        output: "./src/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: {},
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("applies default output filenames", () => {
      const config = {
        output: "./src/generated",
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
        expect(result.data.query?.files.client).toBe("client.ts");
        expect(result.data.query?.files.types).toBe("types.ts");
        expect(result.data.query?.files.operations).toBe("operations.ts");
      }
    });
  });

  describe("error formatting", () => {
    it("provides descriptive error for missing schema url or file", () => {
      const source = {
        name: "graphql",
        type: "graphql",
        schema: {},
        documents: "./src/graphql/**/*.graphql",
      };

      const result = graphqlSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        // With union type, error indicates invalid schema config (must have url or file)
        expect(errors.some((e) => e.path.includes("schema"))).toBe(true);
      }
    });

    it("provides descriptive error for invalid URL", () => {
      const source = {
        name: "graphql",
        type: "graphql",
        schema: { url: "not-a-url" },
        documents: "./src/graphql/**/*.graphql",
      };

      const result = graphqlSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.some((e) => e.path.includes("url"))).toBe(true);
      }
    });

    it("provides descriptive error for missing documents", () => {
      const source = {
        name: "graphql",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
      };

      const result = graphqlSourceSchema.safeParse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.some((e) => e.path.includes("documents"))).toBe(true);
      }
    });

    it("uses default output directory when not specified", () => {
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
  });

  describe("config options", () => {
    it("accepts headers option", () => {
      const config = {
        output: "./src/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: {
                url: "http://localhost:4000/graphql",
                headers: {
                  "x-api-key": "test-key",
                  Authorization: "Bearer token",
                },
              },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts scalars option", () => {
      const config = {
        output: "./src/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              scalars: {
                DateTime: "Date",
                JSON: "Record<string, unknown>",
              },
              documents: "./src/graphql/**/*.graphql",
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts array of document patterns", () => {
      const config = {
        output: "./src/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: [
                "./src/graphql/**/*.graphql",
                "./src/queries/**/*.gql",
              ],
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts custom output filenames", () => {
      const config = {
        output: "./src/generated",
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
            client: "graphql-client.ts",
            types: "graphql-types.ts",
            operations: "graphql-operations.ts",
          },
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query?.files.client).toBe("graphql-client.ts");
        expect(result.data.query?.files.types).toBe("graphql-types.ts");
        expect(result.data.query?.files.operations).toBe(
          "graphql-operations.ts",
        );
      }
    });
  });

  describe("multi-source config", () => {
    it("validates multi-source config", () => {
      const config = {
        output: "./src/generated",
        query: {
          sources: [
            {
              name: "graphql",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: "./src/graphql/**/*.graphql",
            },
            {
              name: "api",
              type: "openapi",
              spec: "./openapi.yaml",
            },
          ],
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query?.sources).toHaveLength(2);
        expect(result.data.query?.sources[0]?.type).toBe("graphql");
        expect(result.data.query?.sources[1]?.type).toBe("openapi");
      }
    });
  });
});

describe("generate command definition", () => {
  // Cast args to access the properties directly since citty uses Resolvable types
  // biome-ignore lint/suspicious/noExplicitAny: citty types are complex
  const args = generateCommand.args as any;
  // biome-ignore lint/suspicious/noExplicitAny: citty types are complex
  const meta = generateCommand.meta as any;

  it("should have correct metadata", () => {
    expect(meta.name).toBe("generate");
    expect(meta.description).toBe(
      "Generate TanStack Query artifacts from GraphQL/OpenAPI sources",
    );
  });

  it("should define --config/-c argument", () => {
    expect(args.config).toBeDefined();
    expect(args.config.type).toBe("string");
    expect(args.config.alias).toBe("c");
  });

  it("should define --force/-f argument", () => {
    expect(args.force).toBeDefined();
    expect(args.force.type).toBe("boolean");
    expect(args.force.alias).toBe("f");
    expect(args.force.default).toBe(false);
  });

  it("should define --watch/-w argument", () => {
    expect(args.watch).toBeDefined();
    expect(args.watch.type).toBe("boolean");
    expect(args.watch.alias).toBe("w");
    expect(args.watch.default).toBe(false);
  });

  it("should define --env-file argument", () => {
    expect(args["env-file"]).toBeDefined();
    expect(args["env-file"].type).toBe("string");
  });

  it("should define --no-dotenv argument", () => {
    expect(args["no-dotenv"]).toBeDefined();
    expect(args["no-dotenv"].type).toBe("boolean");
    expect(args["no-dotenv"].default).toBe(false);
  });
});
