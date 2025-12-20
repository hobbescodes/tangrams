import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection } from "@tanstack/react-db"

import { createPet, deletePet, listPets, updatePet } from "../functions"

import type { QueryClient } from "@tanstack/react-query"

/**
 * Collection options for Pet
 */
export const petCollectionOptions = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions({
      queryKey: ["Pet"],
      queryFn: async () => {
        const response = await listPets()
        return response.data
      },
      queryClient,
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => createPet({ body: m.modified })))
      },
      onUpdate: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => updatePet({ petId: m.original.id, body: m.changes })))
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => deletePet({ petId: m.key })))
      },
    })
  )

