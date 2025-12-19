import {
  petCollectionOptions,
  userCollectionOptions,
} from "@/generated/api/db/collections";

import type { QueryClient } from "@tanstack/react-query";

/**
 * Initialize and return all collections for the application.
 *
 * Collections provide reactive data and local-first mutations with TanStack DB.
 *
 * - Pets: Uses full sync mode (default) - all data fetched, filtering client-side
 * - Users: Uses on-demand sync mode - predicates pushed to server for filtering
 */
export function createCollections(queryClient: QueryClient) {
  return {
    pets: petCollectionOptions(queryClient),
    users: userCollectionOptions(queryClient),
  };
}

export type Collections = ReturnType<typeof createCollections>;
