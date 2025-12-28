import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  generateConfigFromOptions,
  generateTemplateConfig,
} from "../../core/config";

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
    it("creates a config file with template content", async () => {
      const configContent = generateTemplateConfig();
      await writeFile(configPath, configContent, "utf-8");

      expect(existsSync(configPath)).toBe(true);
    });

    it("creates config with valid content", async () => {
      const configContent = generateTemplateConfig();
      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("defineConfig");
      expect(content).toContain("sources");
    });

    it("creates config with placeholder URL", async () => {
      const configContent = generateTemplateConfig();
      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("<YOUR_GRAPHQL_URL>");
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
      const newContent = generateTemplateConfig();
      await writeFile(configPath, newContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("defineConfig");
    });
  });

  describe("generateTemplateConfig (--skip mode)", () => {
    it("returns a valid TypeScript config template", () => {
      const config = generateTemplateConfig();

      expect(config).toContain('import { defineConfig } from "tangrams"');
      expect(config).toContain("export default defineConfig");
    });

    it("includes sources configuration", () => {
      const config = generateTemplateConfig();

      expect(config).toContain("sources:");
      expect(config).toContain('type: "graphql"');
    });

    it("includes schema configuration with placeholder", () => {
      const config = generateTemplateConfig();

      expect(config).toContain("schema:");
      expect(config).toContain("<YOUR_GRAPHQL_URL>");
    });

    it("includes documents pattern", () => {
      const config = generateTemplateConfig();

      expect(config).toContain("documents:");
      expect(config).toContain(".graphql");
    });

    it("includes generates configuration", () => {
      const config = generateTemplateConfig();

      expect(config).toContain("generates:");
      expect(config).toContain('["query"]');
    });

    it("includes commented OpenAPI source example", () => {
      const config = generateTemplateConfig();

      expect(config).toContain('// 	type: "openapi"');
      expect(config).toContain("// 	spec:");
    });
  });

  describe("generateConfigFromOptions (interactive mode)", () => {
    it("generates GraphQL URL-based config", async () => {
      const configContent = generateConfigFromOptions({
        validator: "zod",
        source: {
          type: "graphql",
          name: "my-api",
          schema: { type: "url", url: "https://api.example.com/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      });

      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain('name: "my-api"');
      expect(content).toContain('url: "https://api.example.com/graphql"');
      expect(content).toContain('generates: ["query"]');
    });

    it("generates GraphQL file-based config", async () => {
      const configContent = generateConfigFromOptions({
        validator: "zod",
        source: {
          type: "graphql",
          name: "api",
          schema: {
            type: "file",
            file: "./schema.graphql",
            runtimeUrl: "https://api.example.com/graphql",
          },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query", "form"],
        },
      });

      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain('file: "./schema.graphql"');
      expect(content).toContain('url: "https://api.example.com/graphql"');
    });

    it("generates OpenAPI config", async () => {
      const configContent = generateConfigFromOptions({
        validator: "valibot",
        source: {
          type: "openapi",
          name: "rest-api",
          spec: "./openapi.yaml",
          generates: ["query", "form"],
        },
      });

      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain('validator: "valibot"');
      expect(content).toContain('type: "openapi"');
      expect(content).toContain('spec: "./openapi.yaml"');
    });

    it("includes validator when not zod", async () => {
      const configContent = generateConfigFromOptions({
        validator: "arktype",
        source: {
          type: "graphql",
          name: "api",
          schema: { type: "url", url: "https://api.example.com/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      });

      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain('validator: "arktype"');
    });

    it("omits validator when zod (default)", async () => {
      const configContent = generateConfigFromOptions({
        validator: "zod",
        source: {
          type: "graphql",
          name: "api",
          schema: { type: "url", url: "https://api.example.com/graphql" },
          documents: "./src/graphql/**/*.graphql",
          generates: ["query"],
        },
      });

      await writeFile(configPath, configContent, "utf-8");

      const content = await readFile(configPath, "utf-8");
      expect(content).not.toContain("validator:");
    });
  });
});
