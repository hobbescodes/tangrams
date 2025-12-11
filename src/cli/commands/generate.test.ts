import { describe, expect, it } from "vitest";

import { configSchema } from "../../core/config";

// We test the config loading and validation logic
// rather than the citty command to avoid mocking process.exit()

describe("generate command logic", () => {
  describe("config validation", () => {
    it("validates a valid configuration", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("rejects invalid configuration", () => {
      const config = {
        schema: {},
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it("applies default output filenames", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output.client).toBe("client.ts");
        expect(result.data.output.types).toBe("types.ts");
        expect(result.data.output.operations).toBe("operations.ts");
      }
    });
  });

  describe("error formatting", () => {
    it("provides descriptive error for missing schema url", () => {
      const config = {
        schema: {},
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.path.includes("url"))).toBe(true);
      }
    });

    it("provides descriptive error for invalid URL", () => {
      const config = {
        schema: {
          url: "not-a-url",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.some((e) => e.path.includes("url"))).toBe(true);
      }
    });

    it("provides descriptive error for missing documents", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.some((e) => e.path.includes("documents"))).toBe(true);
      }
    });

    it("provides descriptive error for missing output dir", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {},
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = result.error.errors;
        expect(errors.some((e) => e.path.includes("dir"))).toBe(true);
      }
    });
  });

  describe("config options", () => {
    it("accepts headers option", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
          headers: {
            "x-api-key": "test-key",
            Authorization: "Bearer token",
          },
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts scalars option", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        scalars: {
          DateTime: "Date",
          JSON: "Record<string, unknown>",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts array of document patterns", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: ["./src/graphql/**/*.graphql", "./src/queries/**/*.gql"],
        output: {
          dir: "./src/generated",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("accepts custom output filenames", () => {
      const config = {
        schema: {
          url: "http://localhost:4000/graphql",
        },
        documents: "./src/graphql/**/*.graphql",
        output: {
          dir: "./src/generated",
          client: "graphql-client.ts",
          types: "graphql-types.ts",
          operations: "graphql-operations.ts",
        },
      };

      const result = configSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output.client).toBe("graphql-client.ts");
        expect(result.data.output.types).toBe("graphql-types.ts");
        expect(result.data.output.operations).toBe("graphql-operations.ts");
      }
    });
  });
});
