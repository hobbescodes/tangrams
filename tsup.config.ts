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
});
