import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    resolveSnapshotPath: (testPath, snapExtension) => {
      const testDir = resolve(__dirname, "src/test/__snapshots__");
      const testFileName = testPath.split("/").pop() ?? "test";
      return resolve(testDir, `${testFileName}${snapExtension}`);
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/test/**/*",
        "src/cli/index.ts",
        "src/cli/commands/init.ts",
        "src/cli/commands/generate.ts",
        "src/core/generator.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
