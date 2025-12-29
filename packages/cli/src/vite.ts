/**
 * Tangrams Vite Plugin
 *
 * Provides automatic code generation during Vite dev and build.
 * Configuration is always loaded from a tangrams.config.ts file.
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite"
 * import { tangrams } from "tangrams/vite"
 *
 * export default defineConfig({
 *   plugins: [tangrams()],
 * })
 * ```
 *
 * @example With custom config path
 * ```ts
 * import { defineConfig } from "vite"
 * import { tangrams } from "tangrams/vite"
 *
 * export default defineConfig({
 *   plugins: [
 *     tangrams({
 *       configFile: "./custom-tangrams.config.ts",
 *     }),
 *   ],
 * })
 * ```
 */

import { join } from "node:path";

import picomatch from "picomatch";

import { analyzeCleanup, executeCleanup, needsCleanup } from "./core/cleanup";
import { loadTangramsConfig, sourceGeneratesQuery } from "./core/config";
import { generate } from "./core/generator";
import {
  createEmptyManifest,
  createSourceEntry,
  loadManifest,
  saveManifest,
} from "./core/manifest";
import { createViteLogger } from "./utils/logger";

import type { Plugin, ViteDevServer } from "vite";
import type { TangramsConfig } from "./core/config";
import type { GenerateResult } from "./core/generator";
import type { TangramsLogger } from "./utils/logger";

// =============================================================================
// Plugin Options
// =============================================================================

export interface TangramsPluginOptions {
  /**
   * Path to config file.
   * If not provided, looks for tangrams.config.{ts,js,mjs,cjs,json}
   */
  configFile?: string;

  /**
   * Force regeneration of all files including client.ts
   * @default false
   */
  force?: boolean;

  /**
   * Enable watch mode in development to regenerate on file changes.
   * @default true
   */
  watch?: boolean;

  /**
   * Remove stale source directories from previous generations.
   * @default true
   */
  clean?: boolean;
}

// =============================================================================
// Main Plugin
// =============================================================================

/**
 * Tangrams Vite plugin for code generation
 *
 * The plugin loads configuration from tangrams.config.ts (or a custom path)
 * and provides:
 * - Automatic generation on dev server start and build
 * - File watching in dev mode to regenerate on changes
 * - Cleanup of stale directories
 */
export function tangrams(options: TangramsPluginOptions = {}): Plugin {
  let resolvedConfig: TangramsConfig | null = null;
  let cachedSchemas: Map<string, unknown> | undefined;
  let logger: TangramsLogger;
  let root: string;

  const force = options.force ?? false;
  const clean = options.clean ?? true;
  const watchEnabled = options.watch ?? true;

  return {
    name: "tangrams",

    async configResolved(config) {
      logger = createViteLogger(config.logger);
      root = config.root;

      try {
        // Resolve tangrams config from file
        resolvedConfig = await resolveTangramsConfig(options, root);
      } catch (error) {
        // Log error but don't throw - allow Vite to continue
        // This handles cases where config file doesn't exist yet
        logger.error(
          `Failed to load tangrams config: ${error instanceof Error ? error.message : String(error)}`,
        );
        resolvedConfig = null;
      }
    },

    async buildStart() {
      if (!resolvedConfig) {
        logger.warn("No tangrams config found, skipping generation");
        return;
      }

      try {
        // Run cleanup before generation if enabled
        if (clean) {
          await runCleanup(resolvedConfig, logger, root);
        }

        logger.start("Generating tangrams artifacts...");

        const result = await generate({
          config: resolvedConfig,
          force,
          cachedSchemas,
          logger,
        });

        cachedSchemas = result.schemas;

        // Save manifest after successful generation
        await saveGenerationManifest(resolvedConfig, result, root);

        logger.success("Generation complete");
      } catch (error) {
        logger.error(
          `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    },

    configureServer(server) {
      if (!resolvedConfig || !watchEnabled) return;

      setupDevWatcher(server, resolvedConfig, {
        force,
        clean,
        cachedSchemas,
        logger,
        root,
        onSchemasUpdate: (schemas) => {
          cachedSchemas = schemas;
        },
      });
    },
  };
}

// =============================================================================
// Config Resolution
// =============================================================================

/**
 * Resolve tangrams configuration from config file
 */
async function resolveTangramsConfig(
  options: TangramsPluginOptions,
  root: string,
): Promise<TangramsConfig> {
  // Compute absolute config path if provided, otherwise let c12 discover it
  const configPath = options.configFile
    ? join(root, options.configFile)
    : undefined;

  const { config } = await loadTangramsConfig({
    configPath,
    cwd: root,
  });

  return config;
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Run cleanup to remove stale directories
 * In Vite plugin context, we always auto-yes (no prompts)
 */
async function runCleanup(
  config: TangramsConfig,
  logger: TangramsLogger,
  root: string,
): Promise<void> {
  const tangramsOutputDir = join(config.output, "tangrams");
  const manifest = await loadManifest(join(root, tangramsOutputDir));
  const analysis = await analyzeCleanup(manifest, config, tangramsOutputDir);

  if (!needsCleanup(analysis)) {
    return;
  }

  // Log what we're cleaning up
  for (const rename of analysis.renamedSources) {
    logger.info(`Rename detected: ${rename.oldName} -> ${rename.newName}`);
  }
  for (const orphan of analysis.orphanedSources) {
    logger.info(`Removing stale directory: ${orphan.name}`);
  }

  await executeCleanup(analysis, tangramsOutputDir);
}

// =============================================================================
// Manifest
// =============================================================================

/**
 * Save the manifest after generation
 */
async function saveGenerationManifest(
  config: TangramsConfig,
  result: GenerateResult,
  root: string,
): Promise<void> {
  const tangramsOutputDir = join(config.output, "tangrams");
  const fullOutputDir = join(root, tangramsOutputDir);

  const manifest = createEmptyManifest();

  for (const source of config.sources) {
    const sourceInfo = result.generatedSources.get(source.name);
    if (sourceInfo) {
      manifest.sources[source.name] = createSourceEntry(
        source,
        sourceInfo.files,
      );
    }
  }

  await saveManifest(fullOutputDir, manifest);
}

// =============================================================================
// Dev Watcher
// =============================================================================

interface DevWatcherOptions {
  force: boolean;
  clean: boolean;
  cachedSchemas: Map<string, unknown> | undefined;
  logger: TangramsLogger;
  root: string;
  onSchemasUpdate: (schemas: Map<string, unknown>) => void;
}

/**
 * Setup file watching for dev mode
 */
function setupDevWatcher(
  server: ViteDevServer,
  config: TangramsConfig,
  options: DevWatcherOptions,
): void {
  const { force, clean, logger, root, onSchemasUpdate } = options;
  let { cachedSchemas } = options;

  const patterns = getWatchPatterns(config);

  // Add patterns to Vite's watcher
  if (patterns.length > 0) {
    server.watcher.add(patterns);
  }

  // Debounce regeneration
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let isGenerating = false;

  const handleChange = async (file: string) => {
    // Check if file matches our patterns
    if (!isWatchedFile(file, config)) {
      return;
    }

    // Prevent concurrent generations
    if (isGenerating) {
      return;
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(async () => {
      isGenerating = true;

      try {
        logger.info("File changed, regenerating...");

        // Run cleanup if enabled
        if (clean) {
          await runCleanup(config, logger, root);
        }

        const result = await generate({
          config,
          force,
          cachedSchemas,
          logger,
        });

        cachedSchemas = result.schemas;
        onSchemasUpdate(result.schemas);

        // Save manifest
        await saveGenerationManifest(config, result, root);

        logger.success("Regeneration complete");

        // Trigger full reload
        server.ws.send({ type: "full-reload" });
      } catch (error) {
        logger.error(
          `Regeneration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        isGenerating = false;
      }
    }, 200);
  };

  server.watcher.on("change", handleChange);
  server.watcher.on("add", handleChange);
  server.watcher.on("unlink", handleChange);
}

// =============================================================================
// Watch Patterns
// =============================================================================

/**
 * Get all file patterns to watch for changes
 */
function getWatchPatterns(config: TangramsConfig): string[] {
  const patterns: string[] = [];

  for (const source of config.sources) {
    if (source.type === "graphql") {
      if (!sourceGeneratesQuery(source)) continue;
      const docs = source.documents;
      if (Array.isArray(docs)) {
        patterns.push(...docs);
      } else {
        patterns.push(docs);
      }
    } else if (source.type === "openapi") {
      // Only watch local files, not URLs
      if (!isUrl(source.spec)) {
        patterns.push(source.spec);
      }
    }
  }

  return patterns;
}

/**
 * Check if a file should trigger regeneration
 */
function isWatchedFile(file: string, config: TangramsConfig): boolean {
  for (const source of config.sources) {
    if (source.type === "graphql") {
      const docs = source.documents;
      const patterns = Array.isArray(docs) ? docs : [docs];

      if (picomatch.isMatch(file, patterns)) {
        return true;
      }
    } else if (source.type === "openapi") {
      if (!isUrl(source.spec) && picomatch.isMatch(file, source.spec)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a path is a URL
 */
function isUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

// =============================================================================
// Re-exports
// =============================================================================

export { defineConfig } from "./core/config";

export type { TangramsConfig, TangramsConfigInput } from "./core/config";
