import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "graphql",
      schema: {
        file: "../shared/mocks/schemas/schema.graphql",
      },
      url: "http://localhost:3000/graphql",
      documents: "./src/graphql/**/*.graphql",
      generates: ["db"],
    },
  ],
});
