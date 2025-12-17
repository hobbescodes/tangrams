import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "../shared/mocks/schemas/openapi.yaml",
      generates: ["query", "form"],
    },
  ],
});
