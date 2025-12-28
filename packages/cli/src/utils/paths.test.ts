import { describe, expect, it } from "vitest";

import { getRelativeImportPath } from "./paths";

describe("getRelativeImportPath", () => {
  describe("same directory imports", () => {
    it("returns ./filename for same directory files", () => {
      expect(getRelativeImportPath("/src/api", "/src/api/client.ts")).toBe(
        "./client",
      );
    });

    it("handles files without .ts extension in input", () => {
      expect(getRelativeImportPath("/src/api", "/src/api/client")).toBe(
        "./client",
      );
    });
  });

  describe("parent directory imports", () => {
    it("returns ../filename for parent directory files", () => {
      expect(
        getRelativeImportPath("/src/api/query", "/src/api/schema.ts"),
      ).toBe("../schema");
    });

    it("does not produce ./../ pattern", () => {
      const result = getRelativeImportPath(
        "/src/api/query",
        "/src/api/schema.ts",
      );
      expect(result).not.toContain("./../");
      expect(result).toBe("../schema");
    });

    it("handles deeper nesting", () => {
      expect(
        getRelativeImportPath("/src/api/db/collections", "/src/api/schema.ts"),
      ).toBe("../../schema");
    });
  });

  describe("sibling directory imports", () => {
    it("returns ../sibling/filename for sibling directory files", () => {
      expect(
        getRelativeImportPath("/src/api/query", "/src/api/form/options.ts"),
      ).toBe("../form/options");
    });
  });

  describe("child directory imports", () => {
    it("returns ./child/filename for child directory files", () => {
      expect(
        getRelativeImportPath("/src/api", "/src/api/query/options.ts"),
      ).toBe("./query/options");
    });

    it("handles deeper child paths", () => {
      expect(getRelativeImportPath("/src", "/src/api/query/options.ts")).toBe(
        "./api/query/options",
      );
    });
  });

  describe("edge cases", () => {
    it("handles Windows-style paths", () => {
      // path.relative normalizes these, so the output should still be correct
      const result = getRelativeImportPath(
        "/src/api/query",
        "/src/api/schema.ts",
      );
      expect(result).toBe("../schema");
    });

    it("strips .ts extension from output", () => {
      const result = getRelativeImportPath("/src/api", "/src/api/client.ts");
      expect(result).not.toContain(".ts");
    });
  });
});
