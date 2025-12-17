import { createFileRoute } from "@tanstack/react-router";
import { createFromSource as createSearchServerFromSource } from "fumadocs-core/search/server";

import { source } from "@/lib/source";

const searchServer = createSearchServerFromSource(source, {
  language: "english",
});

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => searchServer.GET(request),
    },
  },
});
