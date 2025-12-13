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
    it("correctly normalizes array form with query", () => {
      const result = normalizeGenerates(["query"]);

      expect(result.query).toBe(true);
      expect(result.form).toBe(false);
      expect(result.db).toBe(false);
    });

    it("correctly normalizes array form with form", () => {
      const result = normalizeGenerates(["form"]);

      expect(result.query).toBe(false);
      expect(result.form).toBe(true);
      expect(result.db).toBe(false);
    });

    it("correctly normalizes array form with db", () => {
      const result = normalizeGenerates(["db"]);

      // db auto-enables query
      expect(result.query).toBe(true);
      expect(result.form).toBe(false);
      expect(result.db).toBe(true);
    });

    it("correctly normalizes all generators", () => {
      const result = normalizeGenerates(["query", "form", "db"]);

      expect(result.query).toBe(true);
      expect(result.form).toBe(true);
      expect(result.db).toBe(true);
    });

    it("auto-enables query when db is specified without query", () => {
      const result = normalizeGenerates(["db", "form"]);

      expect(result.query).toBe(true);
      expect(result.form).toBe(true);
      expect(result.db).toBe(true);
    });
  });
});
