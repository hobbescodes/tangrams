import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

import { createCollections } from "@/lib/collections";
import { routeTree } from "./routeTree.gen";

import type * as React from "react";
import type { Collections } from "@/lib/collections";

export function getRouter() {
  const queryClient = new QueryClient();
  const collections = createCollections(queryClient);

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { queryClient, collections },
    Wrap: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

export interface RouterContext {
  queryClient: QueryClient;
  collections: Collections;
}
