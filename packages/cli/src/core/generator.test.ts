import { describe, expect, it } from "vitest";

import { normalizeGenerates } from "./config";

/**
 * Generator module tests
 *
 * Note: The main generate() function is tested via integration tests
 * in the CLI commands. These tests cover helper functions and utilities.
 */

describe("generator utilities", () => {
  describe("normalizeGenerates integration with generator", () => {
    it("correctly normalizes array form for functions generator", () => {
      const result = normalizeGenerates(["functions"]);

      expect(result.functions).toBeDefined();
      expect(result.functions?.files.functions).toBe("functions.ts");
      expect(result.query).toBeUndefined();
      expect(result.form).toBeUndefined();
    });

    it("correctly normalizes query generator", () => {
      const result = normalizeGenerates({
        query: true,
      });

      expect(result.query).toBeDefined();
      expect(result.query?.files.operations).toBe("operations.ts");
    });

    it("correctly normalizes all generators", () => {
      const result = normalizeGenerates(["query", "functions", "form"]);

      expect(result.query).toBeDefined();
      expect(result.functions).toBeDefined();
      expect(result.form).toBeDefined();
      expect(result.files.client).toBe("client.ts");
      expect(result.files.schema).toBe("schema.ts");
    });

    it("allows custom filenames", () => {
      const result = normalizeGenerates({
        client: "api-client.ts",
        schema: "types.ts",
        query: {
          files: {
            types: "graphql-types.ts",
            operations: "api-operations.ts",
          },
        },
        functions: {
          files: {
            functions: "server-fns.ts",
          },
        },
      });

      expect(result.files.client).toBe("api-client.ts");
      expect(result.files.schema).toBe("types.ts");
      expect(result.query?.files.types).toBe("graphql-types.ts");
      expect(result.query?.files.operations).toBe("api-operations.ts");
      expect(result.functions?.files.functions).toBe("server-fns.ts");
    });
  });
});
