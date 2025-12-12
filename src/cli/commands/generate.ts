import { basename } from "node:path";

import { defineCommand } from "citty";
import consola from "consola";

import { loadTangenConfig, sourceGeneratesQuery } from "../../core/config";
import { generate } from "../../core/generator";
import {
  clearConsole,
  createWatcher,
  setupKeyboardInput,
} from "../../core/watcher";

import type { DotenvOptions } from "c12";
import type {
  GraphQLSourceConfig,
  OpenAPISourceConfig,
  TangenConfig,
} from "../../core/config";
import type { GenerateResult } from "../../core/generator";

/**
 * Determine dotenv options based on CLI arguments
 */
function getDotenvOptions(args: {
  "no-dotenv"?: boolean;
  "env-file"?: string | string[];
}): boolean | DotenvOptions {
  if (args["no-dotenv"]) {
    return false;
  }

  if (args["env-file"]) {
    const envFiles = Array.isArray(args["env-file"])
      ? args["env-file"]
      : [args["env-file"]];
    return { fileName: envFiles };
  }

  return true;
}

/**
 * Get all document patterns from GraphQL sources that generate query code
 */
function getDocumentPatterns(config: TangenConfig): string[] {
  const patterns: string[] = [];
  for (const source of config.sources) {
    // Only watch GraphQL sources that generate query code
    if (source.type === "graphql" && sourceGeneratesQuery(source)) {
      const graphqlSource = source as GraphQLSourceConfig;
      const docs = graphqlSource.documents;
      if (Array.isArray(docs)) {
        patterns.push(...docs);
      } else {
        patterns.push(docs);
      }
    }
  }
  return patterns;
}

/**
 * Check if a path is a URL
 */
function isUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * Get all local OpenAPI spec files from sources
 */
function getOpenAPISpecFiles(config: TangenConfig): string[] {
  const files: string[] = [];
  for (const source of config.sources) {
    if (source.type === "openapi") {
      const openApiSource = source as OpenAPISourceConfig;
      // Only watch local files, not URLs
      if (!isUrl(openApiSource.spec)) {
        files.push(openApiSource.spec);
      }
    }
  }
  return files;
}

/**
 * Run the generation once and return the result for caching
 */
async function runGeneration(options: {
  config: TangenConfig;
  force: boolean;
  cachedSchemas?: Map<string, unknown>;
}): Promise<GenerateResult> {
  const { config, force, cachedSchemas } = options;

  consola.start("Generating TanStack Query artifacts...");
  const result = await generate({ config, force, cachedSchemas });
  consola.success("Generation complete!");

  return result;
}

/**
 * Display the watch mode status message
 */
function displayWatchStatus(options: {
  configPath: string;
  documentPatterns: string[];
  documentCount: number;
  sourceCount: number;
  specFiles: string[];
}): void {
  const {
    configPath,
    documentPatterns,
    documentCount,
    sourceCount,
    specFiles,
  } = options;
  const patterns = documentPatterns.join(", ");

  consola.info("");
  consola.info("Watching for changes...");
  consola.info(`  Config: ${basename(configPath)}`);
  consola.info(`  Sources: ${sourceCount}`);
  if (documentPatterns.length > 0) {
    consola.info(`  Documents: ${patterns} (${documentCount} files)`);
  }
  if (specFiles.length > 0) {
    consola.info(`  OpenAPI specs: ${specFiles.length} file(s)`);
  }
  consola.info("");
  consola.info("Press 'r' to force refresh, 'q' to quit");
}

/**
 * Run in watch mode - watching for file changes and regenerating
 */
async function runWatchMode(options: {
  configPath: string;
  config: TangenConfig;
  dotenv: boolean | DotenvOptions;
  force: boolean;
}): Promise<void> {
  let { configPath, config, dotenv, force } = options;
  let cachedSchemas: Map<string, unknown> | undefined;

  // Get document patterns for GraphQL sources
  let documentPatterns = getDocumentPatterns(config);

  // Get local OpenAPI spec files to watch
  let specFiles = getOpenAPISpecFiles(config);

  // Initial generation
  clearConsole();
  consola.info("Starting watch mode...");
  consola.info("");

  try {
    const result = await runGeneration({ config, force });
    cachedSchemas = result.schemas;
  } catch (error) {
    if (error instanceof Error) {
      consola.error(error.message);
    } else {
      consola.error("An unexpected error occurred");
    }
    consola.info("");
    consola.info("Waiting for changes...");
  }

  // Create a promise that will resolve when the user quits
  let resolveQuit: () => void;
  const quitPromise = new Promise<void>((resolve) => {
    resolveQuit = resolve;
  });

  // Handler for config file changes
  const handleConfigChange = async () => {
    clearConsole();
    consola.info("Config file changed, reloading...");
    consola.info("");

    try {
      // Reload config
      const result = await loadTangenConfig({
        configPath,
        dotenv,
      });
      config = result.config;
      configPath = result.configPath;
      documentPatterns = getDocumentPatterns(config);
      specFiles = getOpenAPISpecFiles(config);

      // Re-introspect schema since config may have changed
      const genResult = await runGeneration({ config, force });
      cachedSchemas = genResult.schemas;

      displayWatchStatus({
        configPath,
        documentPatterns,
        documentCount: watcher.getWatchedDocuments().length,
        sourceCount: config.sources.length,
        specFiles,
      });
    } catch (error) {
      if (error instanceof Error) {
        consola.error(error.message);
      } else {
        consola.error("An unexpected error occurred");
      }
      consola.info("");
      consola.info("Waiting for changes...");
      consola.info("Press 'r' to force refresh, 'q' to quit");
    }
  };

  // Handler for document file changes (GraphQL documents or OpenAPI specs)
  const handleDocumentChange = async () => {
    clearConsole();
    consola.info("Files changed, regenerating...");
    consola.info("");

    try {
      // Use cached schemas for faster regeneration (GraphQL only)
      // For OpenAPI, we need to re-parse since the spec might have changed
      const result = await runGeneration({
        config,
        force,
        cachedSchemas,
      });
      cachedSchemas = result.schemas;

      displayWatchStatus({
        configPath,
        documentPatterns,
        documentCount: watcher.getWatchedDocuments().length,
        sourceCount: config.sources.length,
        specFiles,
      });
    } catch (error) {
      if (error instanceof Error) {
        consola.error(error.message);
      } else {
        consola.error("An unexpected error occurred");
      }
      consola.info("");
      consola.info("Waiting for changes...");
      consola.info("Press 'r' to force refresh, 'q' to quit");
    }
  };

  // Handler for force refresh (re-introspect schema)
  const handleRefresh = async () => {
    clearConsole();
    consola.info("Force refreshing (re-loading all schemas)...");
    consola.info("");

    try {
      // Clear cached schemas to force re-loading
      const result = await runGeneration({ config, force });
      cachedSchemas = result.schemas;

      displayWatchStatus({
        configPath,
        documentPatterns,
        documentCount: watcher.getWatchedDocuments().length,
        sourceCount: config.sources.length,
        specFiles,
      });
    } catch (error) {
      if (error instanceof Error) {
        consola.error(error.message);
      } else {
        consola.error("An unexpected error occurred");
      }
      consola.info("");
      consola.info("Waiting for changes...");
      consola.info("Press 'r' to force refresh, 'q' to quit");
    }
  };

  // Handler for quit
  const handleQuit = async () => {
    consola.info("");
    consola.info("Stopping watch mode...");
    await watcher.stop();
    cleanupKeyboard();
    resolveQuit();
  };

  // Combine GraphQL document patterns with OpenAPI spec files
  // The watcher will watch both types of files
  const filesToWatch = [
    ...(documentPatterns.length > 0 ? documentPatterns : []),
    ...specFiles,
  ];

  // Create the watcher
  const watcher = createWatcher({
    configPath,
    documentPatterns:
      filesToWatch.length > 0 ? filesToWatch : ["./**/*.graphql"],
    onConfigChange: handleConfigChange,
    onDocumentChange: handleDocumentChange,
    onError: (error) => {
      consola.error(`Watcher error: ${error.message}`);
    },
  });

  // Start the watcher
  await watcher.start();

  // Setup keyboard input
  const cleanupKeyboard = setupKeyboardInput({
    onRefresh: handleRefresh,
    onQuit: handleQuit,
  });

  // Display initial status
  displayWatchStatus({
    configPath,
    documentPatterns,
    documentCount: watcher.getWatchedDocuments().length,
    sourceCount: config.sources.length,
    specFiles,
  });

  // Wait for quit
  await quitPromise;
}

export const generateCommand = defineCommand({
  meta: {
    name: "generate",
    description:
      "Generate TanStack Query artifacts from GraphQL/OpenAPI sources",
  },
  args: {
    config: {
      type: "string",
      alias: "c",
      description: "Path to config file",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Force regeneration of all files including client",
      default: false,
    },
    watch: {
      type: "boolean",
      alias: "w",
      description: "Watch for file changes and regenerate automatically",
      default: false,
    },
    "env-file": {
      type: "string",
      description: "Path to env file (can be specified multiple times)",
    },
    "no-dotenv": {
      type: "boolean",
      description: "Disable automatic .env file loading",
      default: false,
    },
  },
  async run({ args }) {
    try {
      consola.start("Loading configuration...");

      const dotenv = getDotenvOptions(args);
      const { config, configPath } = await loadTangenConfig({
        configPath: args.config,
        dotenv,
      });

      if (args.watch) {
        await runWatchMode({
          configPath,
          config,
          dotenv,
          force: args.force,
        });
      } else {
        await runGeneration({ config, force: args.force });
      }
    } catch (error) {
      if (error instanceof Error) {
        consola.error(error.message);
      } else {
        consola.error("An unexpected error occurred");
      }
      process.exit(1);
    }
  },
});
