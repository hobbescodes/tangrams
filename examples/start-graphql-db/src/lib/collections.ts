import { petCollectionOptions } from "@/generated/api/db/collections";

import type { QueryClient } from "@tanstack/react-query";

/**
 * Initialize and return all collections for the application.
 * Collections provide reactive data and local-first mutations with TanStack DB.
 */
export function createCollections(queryClient: QueryClient) {
  return {
    pets: petCollectionOptions(queryClient),
  };
}

export type Collections = ReturnType<typeof createCollections>;
