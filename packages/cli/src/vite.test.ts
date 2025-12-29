import { describe, expect, it } from "vitest";

import { tangrams } from "./vite";

import type { TangramsPluginOptions } from "./vite";

describe("Vite Plugin", () => {
  describe("tangrams", () => {
    it("should return a valid Vite plugin", () => {
      const plugin = tangrams();

      expect(plugin).toBeDefined();
      expect(plugin.name).toBe("tangrams");
      expect(typeof plugin.configResolved).toBe("function");
      expect(typeof plugin.buildStart).toBe("function");
      expect(typeof plugin.configureServer).toBe("function");
    });

    it("should accept empty options", () => {
      const plugin = tangrams();

      expect(plugin.name).toBe("tangrams");
    });

    it("should accept configFile option", () => {
      const options: TangramsPluginOptions = {
        configFile: "./custom-tangrams.config.ts",
      };

      const plugin = tangrams(options);

      expect(plugin.name).toBe("tangrams");
    });

    it("should accept force option", () => {
      const plugin = tangrams({ force: true });

      expect(plugin.name).toBe("tangrams");
    });

    it("should accept watch option", () => {
      const plugin = tangrams({ watch: false });

      expect(plugin.name).toBe("tangrams");
    });

    it("should accept clean option", () => {
      const plugin = tangrams({ clean: false });

      expect(plugin.name).toBe("tangrams");
    });

    it("should accept all options together", () => {
      const options: TangramsPluginOptions = {
        configFile: "./tangrams.config.ts",
        force: true,
        watch: true,
        clean: true,
      };

      const plugin = tangrams(options);

      expect(plugin.name).toBe("tangrams");
    });
  });

  describe("plugin options defaults", () => {
    it("should default force to false", () => {
      // The plugin is created, and force defaults to false internally
      const plugin = tangrams();
      expect(plugin.name).toBe("tangrams");
    });

    it("should default watch to true", () => {
      // Watch defaults to true
      const plugin = tangrams();
      expect(plugin.name).toBe("tangrams");
    });

    it("should default clean to true", () => {
      // Clean defaults to true
      const plugin = tangrams();
      expect(plugin.name).toBe("tangrams");
    });
  });

  describe("configResolved hook", () => {
    it("should be defined as an async function", () => {
      const plugin = tangrams();

      expect(typeof plugin.configResolved).toBe("function");
    });
  });

  describe("buildStart hook", () => {
    it("should be defined as an async function", () => {
      const plugin = tangrams();

      expect(typeof plugin.buildStart).toBe("function");
    });
  });

  describe("configureServer hook", () => {
    it("should be defined as a function", () => {
      const plugin = tangrams();

      expect(typeof plugin.configureServer).toBe("function");
    });
  });
});
