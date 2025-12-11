import { defineConfig } from "./src";

export default defineConfig({
  sources: [
    {
      name: "graphql",
      type: "graphql",
      schema: {
        url: "http://localhost:4000/graphql",
      },
      documents: "./src/test/fixtures/graphql/**/*.graphql",
    },
  ],
  output: {
    dir: "./src/test/generated",
    client: "client.ts",
    types: "types.ts",
    operations: "operations.ts",
  },
});
