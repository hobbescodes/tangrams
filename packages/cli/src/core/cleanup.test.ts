import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  analyzeCleanup,
  executeCleanup,
  getExistingSourceDirectories,
  needsCleanup,
} from "./cleanup";
import { createFingerprint, manifestVersion } from "./manifest";

import type { CleanupAnalysis } from "./cleanup";
import type { TangramsConfig } from "./config";
import type { TangramsManifest } from "./manifest";

// =============================================================================
// Test Setup
// =============================================================================

// Use relative path for testDir so that analyzeCleanup (which uses process.cwd()) works correctly
const testDir = ".test-cleanup";
const testDirAbsolute = join(process.cwd(), testDir);
const tangramsDir = join(testDirAbsolute, "tangrams");
const tangramsOutputDir = join(testDir, "tangrams"); // Relative path for analyzeCleanup

// Helper to create a test config
function createTestConfig(sources: TangramsConfig["sources"]): TangramsConfig {
  return {
    output: testDir, // Relative path
    validator: "zod",
    sources,
  };
}

// Helper to create a test manifest
function createTestManifest(
  sources: Record<string, { type: "graphql" | "openapi"; files: string[] }>,
): TangramsManifest {
  const manifest: TangramsManifest = {
    version: manifestVersion,
    generatedAt: new Date().toISOString(),
    sources: {},
  };

  for (const [name, info] of Object.entries(sources)) {
    const fingerprint =
      info.type === "graphql"
        ? {
            type: "graphql" as const,
            schemaUrl: "http://localhost:4000/graphql",
            documents: ["./src/**/*.graphql"],
          }
        : {
            type: "openapi" as const,
            specPath: "./openapi.yaml",
          };

    manifest.sources[name] = {
      type: info.type,
      configFingerprint: fingerprint,
      generatedAt: new Date().toISOString(),
      files: info.files,
    };
  }

  return manifest;
}

// =============================================================================
// Tests
// =============================================================================

describe("analyzeCleanup", () => {
  beforeEach(async () => {
    await mkdir(tangramsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDirAbsolute, { recursive: true, force: true });
  });

  describe("no cleanup needed", () => {
    it("returns empty analysis when no manifest exists", async () => {
      const config = createTestConfig([
        {
          name: "api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      const analysis = await analyzeCleanup(null, config, "tangrams");

      expect(analysis.orphanedSources).toHaveLength(0);
      expect(analysis.renamedSources).toHaveLength(0);
    });

    it("returns empty analysis when all sources match", async () => {
      // Create source directory
      await mkdir(join(tangramsDir, "api"), { recursive: true });

      const config = createTestConfig([
        {
          name: "api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      const manifest = createTestManifest({
        api: { type: "graphql", files: ["client.ts"] },
      });

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      expect(analysis.orphanedSources).toHaveLength(0);
      expect(analysis.renamedSources).toHaveLength(0);
    });
  });

  describe("orphaned sources", () => {
    it("detects orphaned source when removed from config", async () => {
      // Create source directory that will be orphaned
      await mkdir(join(tangramsDir, "old-api"), { recursive: true });
      await writeFile(join(tangramsDir, "old-api", "client.ts"), "// test");

      const config = createTestConfig([
        {
          name: "new-api",
          type: "openapi", // Different type - no fingerprint match
          spec: "./different-spec.yaml",
          generates: ["query"],
        },
      ]);

      const manifest = createTestManifest({
        "old-api": { type: "graphql", files: ["client.ts"] },
      });

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      expect(analysis.orphanedSources).toHaveLength(1);
      expect(analysis.orphanedSources[0]?.name).toBe("old-api");
      expect(analysis.renamedSources).toHaveLength(0);
    });

    it("skips orphaned source if directory does not exist", async () => {
      // Don't create the directory

      const config = createTestConfig([
        {
          name: "api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      const manifest = createTestManifest({
        "old-api": { type: "graphql", files: ["client.ts"] },
      });

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      // Should not detect orphan since directory doesn't exist
      expect(analysis.orphanedSources).toHaveLength(0);
    });
  });

  describe("renamed sources", () => {
    it("detects rename when fingerprint matches", async () => {
      // Create old source directory with client.ts
      await mkdir(join(tangramsDir, "old-api"), { recursive: true });
      await writeFile(
        join(tangramsDir, "old-api", "client.ts"),
        "// client code",
      );

      // Config with renamed source (same fingerprint)
      const config = createTestConfig([
        {
          name: "new-api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      // Manifest with old source name but same fingerprint
      const manifest: TangramsManifest = {
        version: manifestVersion,
        generatedAt: new Date().toISOString(),
        sources: {
          "old-api": {
            type: "graphql",
            configFingerprint: createFingerprint({
              name: "old-api",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: ["./src/**/*.graphql"],
              generates: ["query"],
            }),
            generatedAt: new Date().toISOString(),
            files: ["client.ts"],
          },
        },
      };

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      expect(analysis.renamedSources).toHaveLength(1);
      expect(analysis.renamedSources[0]?.oldName).toBe("old-api");
      expect(analysis.renamedSources[0]?.newName).toBe("new-api");
      expect(analysis.renamedSources[0]?.hasClientTs).toBe(true);
      expect(analysis.orphanedSources).toHaveLength(0);
    });

    it("detects rename without client.ts", async () => {
      // Create old source directory without client.ts
      await mkdir(join(tangramsDir, "old-api"), { recursive: true });
      await writeFile(join(tangramsDir, "old-api", "schema.ts"), "// schema");

      const config = createTestConfig([
        {
          name: "new-api",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      const manifest: TangramsManifest = {
        version: manifestVersion,
        generatedAt: new Date().toISOString(),
        sources: {
          "old-api": {
            type: "graphql",
            configFingerprint: createFingerprint({
              name: "old-api",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: ["./src/**/*.graphql"],
              generates: ["query"],
            }),
            generatedAt: new Date().toISOString(),
            files: ["schema.ts"],
          },
        },
      };

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      expect(analysis.renamedSources).toHaveLength(1);
      expect(analysis.renamedSources[0]?.hasClientTs).toBe(false);
    });

    it("does not match rename when fingerprints differ", async () => {
      await mkdir(join(tangramsDir, "old-api"), { recursive: true });
      await writeFile(join(tangramsDir, "old-api", "client.ts"), "// client");

      // Config with different fingerprint (different spec path)
      const config = createTestConfig([
        {
          name: "new-api",
          type: "openapi",
          spec: "./different-spec.yaml",
          generates: ["query"],
        },
      ]);

      // Manifest with different fingerprint
      const manifest = createTestManifest({
        "old-api": { type: "openapi", files: ["client.ts"] },
      });

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      // Should be orphaned, not renamed (different spec path)
      expect(analysis.orphanedSources).toHaveLength(1);
      expect(analysis.renamedSources).toHaveLength(0);
    });
  });

  describe("ambiguous matches", () => {
    it("treats as orphan when multiple fingerprints match", async () => {
      await mkdir(join(tangramsDir, "old-api"), { recursive: true });
      await writeFile(join(tangramsDir, "old-api", "client.ts"), "// client");

      // Config with two sources that have same fingerprint as old-api
      const config = createTestConfig([
        {
          name: "new-api-1",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
        {
          name: "new-api-2",
          type: "graphql",
          schema: { url: "http://localhost:4000/graphql" },
          documents: ["./src/**/*.graphql"],
          generates: ["query"],
        },
      ]);

      const manifest: TangramsManifest = {
        version: manifestVersion,
        generatedAt: new Date().toISOString(),
        sources: {
          "old-api": {
            type: "graphql",
            configFingerprint: createFingerprint({
              name: "old-api",
              type: "graphql",
              schema: { url: "http://localhost:4000/graphql" },
              documents: ["./src/**/*.graphql"],
              generates: ["query"],
            }),
            generatedAt: new Date().toISOString(),
            files: ["client.ts"],
          },
        },
      };

      const analysis = await analyzeCleanup(
        manifest,
        config,
        tangramsOutputDir,
      );

      // Should be orphaned due to ambiguity (multiple matches)
      expect(analysis.orphanedSources).toHaveLength(1);
      expect(analysis.renamedSources).toHaveLength(0);
    });
  });
});

describe("needsCleanup", () => {
  it("returns false for empty analysis", () => {
    const analysis: CleanupAnalysis = {
      orphanedSources: [],
      renamedSources: [],
    };
    expect(needsCleanup(analysis)).toBe(false);
  });

  it("returns true when has orphaned sources", () => {
    const analysis: CleanupAnalysis = {
      orphanedSources: [
        {
          name: "old-api",
          directory: "/some/path",
          files: ["client.ts"],
          manifestEntry: {
            type: "graphql",
            configFingerprint: { type: "graphql", documents: [] },
            generatedAt: new Date().toISOString(),
            files: ["client.ts"],
          },
        },
      ],
      renamedSources: [],
    };
    expect(needsCleanup(analysis)).toBe(true);
  });

  it("returns true when has renamed sources", () => {
    const analysis: CleanupAnalysis = {
      orphanedSources: [],
      renamedSources: [
        {
          oldName: "old-api",
          newName: "new-api",
          oldDirectory: "/old/path",
          newDirectory: "/new/path",
          hasClientTs: true,
        },
      ],
    };
    expect(needsCleanup(analysis)).toBe(true);
  });
});

describe("executeCleanup", () => {
  beforeEach(async () => {
    await mkdir(tangramsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDirAbsolute, { recursive: true, force: true });
  });

  it("removes orphaned directories", async () => {
    // Create orphaned directory
    const orphanedDir = join(tangramsDir, "orphaned-api");
    await mkdir(orphanedDir, { recursive: true });
    await writeFile(join(orphanedDir, "client.ts"), "// client");

    const analysis: CleanupAnalysis = {
      orphanedSources: [
        {
          name: "orphaned-api",
          directory: orphanedDir,
          files: ["client.ts"],
          manifestEntry: {
            type: "graphql",
            configFingerprint: { type: "graphql", documents: [] },
            generatedAt: new Date().toISOString(),
            files: ["client.ts"],
          },
        },
      ],
      renamedSources: [],
    };

    await executeCleanup(analysis, tangramsOutputDir);

    // Check directory was removed
    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).not.toContain("orphaned-api");
  });

  it("copies client.ts on rename and removes old directory", async () => {
    // Create old directory with client.ts
    const oldDir = join(tangramsDir, "old-api");
    const newDir = join(tangramsDir, "new-api");
    await mkdir(oldDir, { recursive: true });
    await mkdir(newDir, { recursive: true });
    await writeFile(join(oldDir, "client.ts"), "// custom client code");

    const analysis: CleanupAnalysis = {
      orphanedSources: [],
      renamedSources: [
        {
          oldName: "old-api",
          newName: "new-api",
          oldDirectory: oldDir,
          newDirectory: newDir,
          hasClientTs: true,
        },
      ],
    };

    await executeCleanup(analysis, tangramsOutputDir);

    // Check client.ts was copied
    const { readFile } = await import("node:fs/promises");
    const newClientContent = await readFile(join(newDir, "client.ts"), "utf-8");
    expect(newClientContent).toBe("// custom client code");

    // Check old directory was removed
    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).not.toContain("old-api");
    expect(dirs).toContain("new-api");
  });

  it("handles rename without client.ts", async () => {
    // Create old directory without client.ts
    const oldDir = join(tangramsDir, "old-api");
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, "schema.ts"), "// schema");

    const analysis: CleanupAnalysis = {
      orphanedSources: [],
      renamedSources: [
        {
          oldName: "old-api",
          newName: "new-api",
          oldDirectory: oldDir,
          newDirectory: join(tangramsDir, "new-api"),
          hasClientTs: false,
        },
      ],
    };

    await executeCleanup(analysis, tangramsOutputDir);

    // Check old directory was removed
    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).not.toContain("old-api");
  });
});

describe("getExistingSourceDirectories", () => {
  beforeEach(async () => {
    await mkdir(tangramsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDirAbsolute, { recursive: true, force: true });
  });

  it("returns empty array for empty directory", async () => {
    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).toEqual([]);
  });

  it("returns directory names", async () => {
    await mkdir(join(tangramsDir, "api"), { recursive: true });
    await mkdir(join(tangramsDir, "rest-api"), { recursive: true });

    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).toContain("api");
    expect(dirs).toContain("rest-api");
  });

  it("excludes hidden directories", async () => {
    await mkdir(join(tangramsDir, "api"), { recursive: true });
    await mkdir(join(tangramsDir, ".hidden"), { recursive: true });

    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).toContain("api");
    expect(dirs).not.toContain(".hidden");
  });

  it("excludes files", async () => {
    await mkdir(join(tangramsDir, "api"), { recursive: true });
    await writeFile(join(tangramsDir, ".gitignore"), "*.log");

    const dirs = await getExistingSourceDirectories(tangramsOutputDir);
    expect(dirs).toContain("api");
    expect(dirs).not.toContain(".gitignore");
  });
});
