import { defineConfig } from "./src";

export default defineConfig({
  schema: {
    url: "http://localhost:4000/graphql",
  },
  client: {
    headers: {
      "Content-Type": "application/json",
    },
  },
  documents: "./test/graphql/**/*.graphql",
  output: {
    dir: "./test/generated",
    client: "client.ts",
    types: "types.ts",
    operations: "operations.ts",
  },
});
