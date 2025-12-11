import { defineCommand } from "citty";
import consola from "consola";

import { loadTangenConfig } from "../../core/config";
import { generate } from "../../core/generator";

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
  },
  async run({ args }) {
    try {
      consola.start("Loading configuration...");
      const config = await loadTangenConfig(args.config);

      consola.start("Generating TanStack Query artifacts...");
      await generate(config);

      consola.success("Generation complete!");
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
