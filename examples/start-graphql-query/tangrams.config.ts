import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "graphql",
      schema: {
        file: "../shared/mocks/schemas/schema.graphql",
      },
      documents: "./src/graphql/**/*.graphql",
      generates: ["query"],
    },
  ],
});
