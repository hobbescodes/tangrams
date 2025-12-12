import { defineCommand, runMain } from "citty";

import { generateCommand } from "./commands/generate";
import { initCommand } from "./commands/init";

const main = defineCommand({
  meta: {
    name: "tangrams",
    version: "0.1.0",
    description: "Generate TanStack Query artifacts from GraphQL schemas",
  },
  subCommands: {
    init: initCommand,
    generate: generateCommand,
  },
});

export function run() {
  runMain(main);
}
