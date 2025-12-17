import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "bin/cli.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "esnext",
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
  onSuccess: async () => {
    const root = resolve(import.meta.dirname, "../..");
    const cli = import.meta.dirname;
    await Promise.all([
      copyFile(resolve(root, "README.md"), resolve(cli, "README.md")),
      copyFile(resolve(root, "LICENSE"), resolve(cli, "LICENSE")),
    ]);
    console.log("Copied README.md and LICENSE from root");
  },
});
