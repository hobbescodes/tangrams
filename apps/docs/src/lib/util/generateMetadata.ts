import { createMetadataGenerator } from "tanstack-meta";

export const generateMetadata = createMetadataGenerator({
  titleTemplate: { default: "Tangrams", template: "%s | Tangrams" },
  baseUrl: "https://tangrams.dev",
});
