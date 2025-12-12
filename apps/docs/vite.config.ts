import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import * as MdxConfig from "./source.config";

const fumadocsDeps = ["fumadocs-core", "fumadocs-ui"];

export default defineConfig({
  plugins: [
    mdx(MdxConfig),
    tailwindcss(),
    tanstackStart(),
    react(),
    tsconfigPaths(),
  ],
  ssr: {
    noExternal: fumadocsDeps,
  },
  optimizeDeps: {
    exclude: fumadocsDeps,
  },
});
