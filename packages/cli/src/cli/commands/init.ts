import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineCommand } from "citty";
import consola from "consola";

import {
  generateConfigFromOptions,
  generateTemplateConfig,
} from "../../core/config";

import type {
  ConfigGenerationOptions,
  GraphQLSourceOptions,
  OpenAPISourceOptions,
  ValidatorLibrary,
} from "../../core/config";

type GeneratesOption = "query" | "form" | "db";

/**
 * Check if a prompt result is valid (not a symbol from Ctrl+C)
 */
function isValidPromptResult<T>(result: T | symbol): result is T {
  return typeof result !== "symbol";
}

/**
 * Run the interactive configuration prompts
 */
async function runInteractivePrompts(): Promise<ConfigGenerationOptions | null> {
  // Prompt for validator library
  const validator = await consola.prompt("Which validation library?", {
    type: "select",
    options: [
      { value: "zod", label: "Zod", hint: "default" },
      { value: "valibot", label: "Valibot", hint: "smaller bundle size" },
      { value: "arktype", label: "ArkType", hint: "type-first validation" },
      { value: "effect", label: "Effect", hint: "Effect ecosystem" },
    ],
    initial: "zod",
  });

  if (!isValidPromptResult(validator)) {
    return null;
  }

  // Prompt for source type
  const sourceType = await consola.prompt("What type of API source?", {
    type: "select",
    options: [
      { value: "graphql", label: "GraphQL" },
      { value: "openapi", label: "OpenAPI" },
    ],
  });

  if (!isValidPromptResult(sourceType)) {
    return null;
  }

  // Prompt for source name
  const sourceName = await consola.prompt("Source name:", {
    type: "text",
    default: "api",
    placeholder: "api",
  });

  if (!isValidPromptResult(sourceName) || !sourceName) {
    return null;
  }

  // Validate source name format
  const nameRegex = /^[a-z][a-z0-9-]*$/;
  if (!nameRegex.test(sourceName)) {
    consola.error(
      "Source name must be lowercase alphanumeric with hyphens, starting with a letter.",
    );
    return null;
  }

  let source: GraphQLSourceOptions | OpenAPISourceOptions;

  if (sourceType === "graphql") {
    // Prompt for GraphQL schema type
    const schemaType = await consola.prompt(
      "How is your GraphQL schema provided?",
      {
        type: "select",
        options: [
          { value: "url", label: "URL", hint: "introspection endpoint" },
          { value: "file", label: "Local file", hint: ".graphql schema file" },
        ],
      },
    );

    if (!isValidPromptResult(schemaType)) {
      return null;
    }

    if (schemaType === "url") {
      const schemaUrl = await consola.prompt("GraphQL endpoint URL:", {
        type: "text",
        placeholder: "https://api.example.com/graphql",
      });

      if (!isValidPromptResult(schemaUrl) || !schemaUrl) {
        return null;
      }

      // Prompt for documents path
      const documents = await consola.prompt("Documents glob pattern:", {
        type: "text",
        default: "./src/graphql/**/*.graphql",
        placeholder: "./src/graphql/**/*.graphql",
      });

      if (!isValidPromptResult(documents) || !documents) {
        return null;
      }

      // Prompt for what to generate
      const generates = await consola.prompt("What to generate?", {
        type: "multiselect",
        options: [
          {
            value: "query",
            label: "Query",
            hint: "queryOptions, mutationOptions",
          },
          { value: "form", label: "Form", hint: "formOptions with validation" },
          { value: "db", label: "DB", hint: "TanStack DB collections" },
        ],
        required: true,
      });

      if (!isValidPromptResult(generates) || generates.length === 0) {
        consola.error("At least one generator must be selected.");
        return null;
      }

      source = {
        type: "graphql",
        name: sourceName,
        schema: { type: "url", url: schemaUrl },
        documents,
        generates: generates as unknown as GeneratesOption[],
      };
    } else {
      // File-based schema
      const schemaFile = await consola.prompt("Schema file path:", {
        type: "text",
        placeholder: "./schema.graphql",
      });

      if (!isValidPromptResult(schemaFile) || !schemaFile) {
        return null;
      }

      const runtimeUrl = await consola.prompt("Runtime GraphQL endpoint URL:", {
        type: "text",
        placeholder: "https://api.example.com/graphql",
      });

      if (!isValidPromptResult(runtimeUrl) || !runtimeUrl) {
        return null;
      }

      // Prompt for documents path
      const documents = await consola.prompt("Documents glob pattern:", {
        type: "text",
        default: "./src/graphql/**/*.graphql",
        placeholder: "./src/graphql/**/*.graphql",
      });

      if (!isValidPromptResult(documents) || !documents) {
        return null;
      }

      // Prompt for what to generate
      const generates = await consola.prompt("What to generate?", {
        type: "multiselect",
        options: [
          {
            value: "query",
            label: "Query",
            hint: "queryOptions, mutationOptions",
          },
          { value: "form", label: "Form", hint: "formOptions with validation" },
          { value: "db", label: "DB", hint: "TanStack DB collections" },
        ],
        required: true,
      });

      if (!isValidPromptResult(generates) || generates.length === 0) {
        consola.error("At least one generator must be selected.");
        return null;
      }

      source = {
        type: "graphql",
        name: sourceName,
        schema: { type: "file", file: schemaFile, runtimeUrl },
        documents,
        generates: generates as unknown as GeneratesOption[],
      };
    }
  } else {
    // OpenAPI source
    const spec = await consola.prompt("OpenAPI spec path or URL:", {
      type: "text",
      placeholder: "./openapi.yaml or https://api.example.com/openapi.json",
    });

    if (!isValidPromptResult(spec) || !spec) {
      return null;
    }

    // Prompt for what to generate
    const generates = await consola.prompt("What to generate?", {
      type: "multiselect",
      options: [
        {
          value: "query",
          label: "Query",
          hint: "queryOptions, mutationOptions",
        },
        { value: "form", label: "Form", hint: "formOptions with validation" },
        { value: "db", label: "DB", hint: "TanStack DB collections" },
      ],
      required: true,
    });

    if (!isValidPromptResult(generates) || generates.length === 0) {
      consola.error("At least one generator must be selected.");
      return null;
    }

    source = {
      type: "openapi",
      name: sourceName,
      spec,
      generates: generates as unknown as GeneratesOption[],
    };
  }

  return {
    validator: validator as ValidatorLibrary,
    source,
  };
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize a tangrams configuration file",
  },
  args: {
    force: {
      type: "boolean",
      alias: "f",
      description: "Overwrite existing config file",
      default: false,
    },
    skip: {
      type: "boolean",
      alias: "s",
      description: "Skip interactive prompts and generate a template config",
      default: false,
    },
  },
  async run({ args }) {
    const configPath = join(process.cwd(), "tangrams.config.ts");

    if (existsSync(configPath) && !args.force) {
      consola.error(
        `Config file already exists at ${configPath}. Use --force to overwrite.`,
      );
      process.exit(1);
    }

    let configContent: string;

    if (args.skip) {
      // Generate template config with placeholders
      configContent = generateTemplateConfig();
      await writeFile(configPath, configContent, "utf-8");

      consola.success("Created tangrams.config.ts");
      consola.info("Next steps:");
      consola.info("  1. Update the placeholder values in tangrams.config.ts");
      consola.info("  2. For GraphQL: Create your operation files (.graphql)");
      consola.info("  3. Run `tangrams generate` to generate TypeScript code");
    } else {
      // Run interactive prompts
      const options = await runInteractivePrompts();

      if (!options) {
        consola.info("Configuration cancelled.");
        process.exit(0);
      }

      configContent = generateConfigFromOptions(options);
      await writeFile(configPath, configContent, "utf-8");

      consola.success("Created tangrams.config.ts");
      consola.info("Next steps:");
      if (options.source.type === "graphql") {
        consola.info("  1. Create your GraphQL operation files (.graphql)");
        consola.info(
          "  2. Run `tangrams generate` to generate TypeScript code",
        );
      } else {
        consola.info(
          "  1. Run `tangrams generate` to generate TypeScript code",
        );
      }
    }
  },
});
