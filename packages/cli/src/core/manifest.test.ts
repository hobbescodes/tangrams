import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyManifest,
  createFingerprint,
  createSourceEntry,
  fingerprintsMatch,
  getManifestPath,
  loadManifest,
  manifestFileName,
  manifestVersion,
  saveManifest,
} from "./manifest";

import type { GraphQLSourceConfig, OpenAPISourceConfig } from "./config";
import type { TangramsManifest } from "./manifest";

// =============================================================================
// Test Fixtures
// =============================================================================

const graphqlSourceWithUrl: GraphQLSourceConfig = {
  name: "api",
  type: "graphql",
  schema: { url: "http://localhost:4000/graphql" },
  documents: ["./src/**/*.graphql"],
  generates: ["query"],
};

const graphqlSourceWithFile: GraphQLSourceConfig = {
  name: "api",
  type: "graphql",
  schema: { file: ["./schema.graphql", "./types.graphql"] },
  url: "http://localhost:4000/graphql",
  documents: "./src/**/*.graphql",
  generates: ["query", "form"],
};

const openApiSource: OpenAPISourceConfig = {
  name: "rest-api",
  type: "openapi",
  spec: "./openapi.yaml",
  generates: ["query"],
};

const openApiSourceWithPatterns: OpenAPISourceConfig = {
  name: "rest-api",
  type: "openapi",
  spec: "./openapi.yaml",
  include: ["/users/**", "/posts/**"],
  exclude: ["/admin/**"],
  generates: ["query", "form"],
};

// =============================================================================
// createFingerprint Tests
// =============================================================================

describe("createFingerprint", () => {
  describe("GraphQL sources", () => {
    it("creates fingerprint with schema URL", () => {
      const fingerprint = createFingerprint(graphqlSourceWithUrl);

      expect(fingerprint).toEqual({
        type: "graphql",
        schemaUrl: "http://localhost:4000/graphql",
        documents: ["./src/**/*.graphql"],
      });
    });

    it("creates fingerprint with schema files (sorted)", () => {
      const fingerprint = createFingerprint(graphqlSourceWithFile);

      expect(fingerprint).toEqual({
        type: "graphql",
        schemaFiles: ["./schema.graphql", "./types.graphql"],
        documents: ["./src/**/*.graphql"],
      });
    });

    it("normalizes single document string to array", () => {
      const source: GraphQLSourceConfig = {
        ...graphqlSourceWithUrl,
        documents: "./src/queries.graphql",
      };
      const fingerprint = createFingerprint(source);

      expect(fingerprint).toEqual({
        type: "graphql",
        schemaUrl: "http://localhost:4000/graphql",
        documents: ["./src/queries.graphql"],
      });
    });

    it("sorts document patterns", () => {
      const source: GraphQLSourceConfig = {
        ...graphqlSourceWithUrl,
        documents: ["./z-queries.graphql", "./a-mutations.graphql"],
      };
      const fingerprint = createFingerprint(source);

      expect(fingerprint).toEqual({
        type: "graphql",
        schemaUrl: "http://localhost:4000/graphql",
        documents: ["./a-mutations.graphql", "./z-queries.graphql"],
      });
    });
  });

  describe("OpenAPI sources", () => {
    it("creates fingerprint with spec path", () => {
      const fingerprint = createFingerprint(openApiSource);

      expect(fingerprint).toEqual({
        type: "openapi",
        specPath: "./openapi.yaml",
      });
    });

    it("creates fingerprint with include/exclude patterns", () => {
      const fingerprint = createFingerprint(openApiSourceWithPatterns);

      expect(fingerprint).toEqual({
        type: "openapi",
        specPath: "./openapi.yaml",
        include: ["/posts/**", "/users/**"], // Sorted
        exclude: ["/admin/**"],
      });
    });
  });
});

// =============================================================================
// fingerprintsMatch Tests
// =============================================================================

describe("fingerprintsMatch", () => {
  describe("type mismatch", () => {
    it("returns false for different types", () => {
      const graphqlFp = createFingerprint(graphqlSourceWithUrl);
      const openapiFp = createFingerprint(openApiSource);

      expect(fingerprintsMatch(graphqlFp, openapiFp)).toBe(false);
    });
  });

  describe("GraphQL fingerprints", () => {
    it("matches identical fingerprints (URL-based)", () => {
      const fp1 = createFingerprint(graphqlSourceWithUrl);
      const fp2 = createFingerprint(graphqlSourceWithUrl);

      expect(fingerprintsMatch(fp1, fp2)).toBe(true);
    });

    it("matches identical fingerprints (file-based)", () => {
      const fp1 = createFingerprint(graphqlSourceWithFile);
      const fp2 = createFingerprint(graphqlSourceWithFile);

      expect(fingerprintsMatch(fp1, fp2)).toBe(true);
    });

    it("returns false for different schema URLs", () => {
      const fp1 = createFingerprint(graphqlSourceWithUrl);
      const fp2 = createFingerprint({
        ...graphqlSourceWithUrl,
        schema: { url: "http://localhost:5000/graphql" },
      });

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });

    it("returns false for different documents", () => {
      const fp1 = createFingerprint(graphqlSourceWithUrl);
      const fp2 = createFingerprint({
        ...graphqlSourceWithUrl,
        documents: ["./other/**/*.graphql"],
      });

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });

    it("returns false for URL vs file schema", () => {
      const fp1 = createFingerprint(graphqlSourceWithUrl);
      const fp2 = createFingerprint(graphqlSourceWithFile);

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });
  });

  describe("OpenAPI fingerprints", () => {
    it("matches identical fingerprints", () => {
      const fp1 = createFingerprint(openApiSource);
      const fp2 = createFingerprint(openApiSource);

      expect(fingerprintsMatch(fp1, fp2)).toBe(true);
    });

    it("matches with same include/exclude patterns", () => {
      const fp1 = createFingerprint(openApiSourceWithPatterns);
      const fp2 = createFingerprint(openApiSourceWithPatterns);

      expect(fingerprintsMatch(fp1, fp2)).toBe(true);
    });

    it("returns false for different spec paths", () => {
      const fp1 = createFingerprint(openApiSource);
      const fp2 = createFingerprint({
        ...openApiSource,
        spec: "./other-api.yaml",
      });

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });

    it("returns false for different include patterns", () => {
      const fp1 = createFingerprint(openApiSourceWithPatterns);
      const fp2 = createFingerprint({
        ...openApiSourceWithPatterns,
        include: ["/users/**"],
      });

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });

    it("returns false when one has patterns and other does not", () => {
      const fp1 = createFingerprint(openApiSource);
      const fp2 = createFingerprint(openApiSourceWithPatterns);

      expect(fingerprintsMatch(fp1, fp2)).toBe(false);
    });
  });
});

// =============================================================================
// Manifest I/O Tests
// =============================================================================

describe("Manifest I/O", () => {
  const testDir = join(process.cwd(), ".test-manifest-io");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("getManifestPath", () => {
    it("returns correct path", () => {
      const path = getManifestPath("/some/tangrams/dir");
      expect(path).toBe(`/some/tangrams/dir/${manifestFileName}`);
    });
  });

  describe("loadManifest", () => {
    it("returns null when manifest does not exist", async () => {
      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
      await writeFile(join(testDir, manifestFileName), "invalid json");
      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });

    it("returns null for wrong version", async () => {
      const invalidManifest = {
        version: 999,
        generatedAt: new Date().toISOString(),
        sources: {},
      };
      await writeFile(
        join(testDir, manifestFileName),
        JSON.stringify(invalidManifest),
      );
      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });

    it("returns null for missing required fields", async () => {
      const invalidManifest = { version: manifestVersion };
      await writeFile(
        join(testDir, manifestFileName),
        JSON.stringify(invalidManifest),
      );
      const manifest = await loadManifest(testDir);
      expect(manifest).toBeNull();
    });

    it("loads valid manifest", async () => {
      const validManifest: TangramsManifest = {
        version: manifestVersion,
        generatedAt: "2024-01-01T00:00:00.000Z",
        sources: {
          api: {
            type: "graphql",
            configFingerprint: {
              type: "graphql",
              schemaUrl: "http://localhost:4000/graphql",
              documents: ["./src/**/*.graphql"],
            },
            generatedAt: "2024-01-01T00:00:00.000Z",
            files: ["client.ts", "schema.ts"],
          },
        },
      };
      await writeFile(
        join(testDir, manifestFileName),
        JSON.stringify(validManifest),
      );

      const manifest = await loadManifest(testDir);
      expect(manifest).toEqual(validManifest);
    });
  });

  describe("saveManifest", () => {
    it("saves manifest to file", async () => {
      const manifest = createEmptyManifest();
      manifest.sources.api = createSourceEntry(graphqlSourceWithUrl, [
        "client.ts",
        "schema.ts",
      ]);

      await saveManifest(testDir, manifest);

      const loaded = await loadManifest(testDir);
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe(manifestVersion);
      expect(loaded?.sources.api).toBeDefined();
      expect(loaded?.sources.api?.files).toEqual(["client.ts", "schema.ts"]);
    });
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe("createEmptyManifest", () => {
  it("creates manifest with correct version", () => {
    const manifest = createEmptyManifest();

    expect(manifest.version).toBe(manifestVersion);
    expect(manifest.sources).toEqual({});
    expect(manifest.generatedAt).toBeDefined();
  });
});

describe("createSourceEntry", () => {
  it("creates entry for GraphQL source", () => {
    const entry = createSourceEntry(graphqlSourceWithUrl, [
      "client.ts",
      "schema.ts",
    ]);

    expect(entry.type).toBe("graphql");
    expect(entry.files).toEqual(["client.ts", "schema.ts"]);
    expect(entry.configFingerprint.type).toBe("graphql");
    expect(entry.generatedAt).toBeDefined();
  });

  it("creates entry for OpenAPI source", () => {
    const entry = createSourceEntry(openApiSource, [
      "client.ts",
      "functions.ts",
    ]);

    expect(entry.type).toBe("openapi");
    expect(entry.files).toEqual(["client.ts", "functions.ts"]);
    expect(entry.configFingerprint.type).toBe("openapi");
  });
});
