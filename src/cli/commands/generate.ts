import { basename } from "node:path";

import { defineCommand } from "citty";
import consola from "consola";

import { loadTangenConfig } from "../../core/config";
import { generate } from "../../core/generator";
import {
  clearConsole,
  createWatcher,
  setupKeyboardInput,
} from "../../core/watcher";

import type { DotenvOptions } from "c12";
import type { GraphQLSchema } from "graphql";
import type { TangenConfig } from "../../core/config";

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
 * Run the generation once and return the schema for caching
 */
async function runGeneration(options: {
  config: TangenConfig;
  force: boolean;
  cachedSchema?: GraphQLSchema;
}): Promise<GraphQLSchema> {
  const { config, force, cachedSchema } = options;

  consola.start("Generating TanStack Query artifacts...");
  const result = await generate({ config, force, cachedSchema });
  consola.success("Generation complete!");

  return result.schema;
}

/**
 * Display the watch mode status message
 */
function displayWatchStatus(options: {
  configPath: string;
  documentPatterns: string | string[];
  documentCount: number;
}): void {
  const { configPath, documentPatterns, documentCount } = options;
  const patterns = Array.isArray(documentPatterns)
    ? documentPatterns.join(", ")
    : documentPatterns;

  consola.info("");
  consola.info("Watching for changes...");
  consola.info(`  Config: ${basename(configPath)}`);
  consola.info(`  Documents: ${patterns} (${documentCount} files)`);
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
  let cachedSchema: GraphQLSchema | undefined;

  // Initial generation
  clearConsole();
  consola.info("Starting watch mode...");
  consola.info("");

  try {
    cachedSchema = await runGeneration({ config, force });
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

      // Re-introspect schema since config may have changed URL/headers
      cachedSchema = await runGeneration({ config, force });

      displayWatchStatus({
        configPath,
        documentPatterns: config.documents,
        documentCount: watcher.getWatchedDocuments().length,
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

  // Handler for document file changes
  const handleDocumentChange = async () => {
    clearConsole();
    consola.info("Documents changed, regenerating...");
    consola.info("");

    try {
      // Use cached schema for faster regeneration
      cachedSchema = await runGeneration({ config, force, cachedSchema });

      displayWatchStatus({
        configPath,
        documentPatterns: config.documents,
        documentCount: watcher.getWatchedDocuments().length,
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
    consola.info("Force refreshing (re-introspecting schema)...");
    consola.info("");

    try {
      // Clear cached schema to force re-introspection
      cachedSchema = await runGeneration({ config, force });

      displayWatchStatus({
        configPath,
        documentPatterns: config.documents,
        documentCount: watcher.getWatchedDocuments().length,
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

  // Create the watcher
  const watcher = createWatcher({
    configPath,
    documentPatterns: config.documents,
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
    documentPatterns: config.documents,
    documentCount: watcher.getWatchedDocuments().length,
  });

  // Wait for quit
  await quitPromise;
}

export const generateCommand = defineCommand({
  meta: {
    name: "generate",
    description: "Generate TanStack Query artifacts from GraphQL schema",
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
