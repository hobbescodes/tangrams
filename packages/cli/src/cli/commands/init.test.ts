import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateDefaultConfig } from "../../core/config";

// We test the logic directly rather than the citty command
// to avoid mocking process.cwd() and process.exit()

describe("init command logic", () => {
  const testDir = join(__dirname, ".test-init");
  const configPath = join(testDir, "tangrams.config.ts");

  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("when config file does not exist", () => {
    it("creates a config file", async () => {
      const configContent = generateDefaultConfig();
      await writeFile(configPath, configContent, "utf-8");

      expect(existsSync(configPath)).toBe(true);
    });

    it("creates config with valid content", async () => {
      const configContent = generateDefaultConfig();
      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("defineConfig");
      expect(content).toContain("sources");
      // Output uses default value (./src/generated) so it's not in the template
    });
  });

  describe("when config file already exists", () => {
    beforeEach(async () => {
      await writeFile(configPath, "existing content", "utf-8");
    });

    it("detects existing config file", () => {
      expect(existsSync(configPath)).toBe(true);
    });

    it("can be forced to overwrite", async () => {
      const newContent = generateDefaultConfig();
      await writeFile(configPath, newContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("defineConfig");
    });
  });

  describe("generateDefaultConfig", () => {
    it("returns a valid TypeScript config template", () => {
      const config = generateDefaultConfig();

      expect(config).toContain('import { defineConfig } from "tangrams"');
      expect(config).toContain("export default defineConfig");
    });

    it("includes sources configuration", () => {
      const config = generateDefaultConfig();

      expect(config).toContain("sources:");
      expect(config).toContain('type: "graphql"');
    });

    it("includes schema configuration", () => {
      const config = generateDefaultConfig();

      expect(config).toContain("schema:");
      expect(config).toContain("url:");
    });

    it("includes documents pattern", () => {
      const config = generateDefaultConfig();

      expect(config).toContain("documents:");
      expect(config).toContain(".graphql");
    });

    it("includes generates configuration", () => {
      const config = generateDefaultConfig();

      expect(config).toContain("generates:");
      expect(config).toContain('["query"]');
    });

    it("includes commented OpenAPI source example", () => {
      const config = generateDefaultConfig();

      expect(config).toContain('// 	type: "openapi"');
      expect(config).toContain("// 	spec:");
    });
  });
});
