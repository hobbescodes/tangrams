import { describe, expect, it } from "vitest";

import { getAdapter, getRegisteredAdapterTypes, hasAdapter } from "./index";

describe("Adapter Registry", () => {
  describe("getAdapter", () => {
    it("returns the graphql adapter for graphql type", () => {
      const adapter = getAdapter("graphql");
      expect(adapter).toBeDefined();
      expect(adapter.type).toBe("graphql");
    });

    it("returns the openapi adapter for openapi type", () => {
      const adapter = getAdapter("openapi");
      expect(adapter).toBeDefined();
      expect(adapter.type).toBe("openapi");
    });

    it("throws error for unknown adapter type", () => {
      expect(() => {
        // @ts-expect-error - Testing invalid type
        getAdapter("unknown");
      }).toThrow('No adapter registered for source type "unknown"');
    });

    it("includes available types in error message", () => {
      try {
        // @ts-expect-error - Testing invalid type
        getAdapter("invalid");
      } catch (error) {
        expect((error as Error).message).toContain("graphql");
        expect((error as Error).message).toContain("openapi");
      }
    });
  });

  describe("hasAdapter", () => {
    it("returns true for registered graphql adapter", () => {
      expect(hasAdapter("graphql")).toBe(true);
    });

    it("returns true for registered openapi adapter", () => {
      expect(hasAdapter("openapi")).toBe(true);
    });

    it("returns false for unregistered adapter type", () => {
      expect(hasAdapter("unknown")).toBe(false);
    });
  });

  describe("getRegisteredAdapterTypes", () => {
    it("returns array of registered adapter types", () => {
      const types = getRegisteredAdapterTypes();
      expect(types).toContain("graphql");
      expect(types).toContain("openapi");
    });

    it("returns at least 2 adapters (graphql and openapi)", () => {
      const types = getRegisteredAdapterTypes();
      expect(types.length).toBeGreaterThanOrEqual(2);
    });
  });
});
