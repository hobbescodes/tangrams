import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { defineCommand } from "citty";
import consola from "consola";

import { generateDefaultConfig } from "../../core/config";

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
  },
  async run({ args }) {
    const configPath = join(process.cwd(), "tangrams.config.ts");

    if (existsSync(configPath) && !args.force) {
      consola.error(
        `Config file already exists at ${configPath}. Use --force to overwrite.`,
      );
      process.exit(1);
    }

    const configContent = generateDefaultConfig();
    await writeFile(configPath, configContent, "utf-8");

    consola.success("Created tangrams.config.ts");
    consola.info("Next steps:");
    consola.info("  1. Update the schema URL/spec in tangrams.config.ts");
    consola.info("  2. Create your GraphQL operation files (.graphql)");
    consola.info("  3. Run `tangrams generate` to generate TypeScript code");
  },
});
