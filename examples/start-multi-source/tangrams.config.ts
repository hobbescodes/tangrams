import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "pets",
      type: "graphql",
      schema: {
        file: "../shared/mocks/schemas/schema.graphql",
      },
      url: "http://localhost:3000/graphql",
      documents: "./src/graphql/operations.graphql",
      generates: ["query", "form"],
    },
    {
      name: "users",
      type: "openapi",
      spec: "../shared/mocks/schemas/openapi.yaml",
      exclude: ["/pets/**"],
      generates: ["query", "form"],
    },
  ],
});
