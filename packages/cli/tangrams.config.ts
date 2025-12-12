import { defineConfig } from "./src";

export default defineConfig({
  output: "./src/test/generated",
  sources: [
    {
      name: "graphql",
      type: "graphql",
      schema: {
        url: "http://localhost:4000/graphql",
      },
      documents: "./src/test/fixtures/graphql/**/*.graphql",
      generates: ["query"],
    },
  ],
});
