import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "../shared/mocks/schemas/openapi.yaml",
      generates: ["query", "form", "db"],
      overrides: {
        db: {
          collections: {
            // Pets use full sync (default) - good for small datasets
            Pet: {
              syncMode: "full",
            },
            // Users use on-demand sync - demonstrates predicate push-down
            User: {
              syncMode: "on-demand",
              predicateMapping: "rest-simple",
            },
          },
        },
      },
    },
  ],
});
