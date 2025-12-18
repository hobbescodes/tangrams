import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection } from "@tanstack/react-db"

import { createPet, deletePet, getPets, updatePet } from "../functions"

import type { QueryClient } from "@tanstack/react-query"

/**
 * Collection options for Pet
 */
export const petCollectionOptions = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions({
      queryKey: ["Pet"],
      queryFn: async () => {
        const response = await getPets()
        return response.pets.data
      },
      queryClient,
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => createPet({ input: m.modified })))
      },
      onUpdate: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => updatePet({ id: m.original.id, input: m.changes })))
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => deletePet({ id: m.key })))
      },
    })
  )
