import { parseLoadSubsetOptions, queryCollectionOptions } from "@tanstack/query-db-collection"
import { createCollection } from "@tanstack/react-db"

import { createPet, createUser, deletePet, deleteUser, listPets, listUsers, updatePet, updateUser } from "../functions"

import type { LoadSubsetOptions } from "@tanstack/db"
import type { QueryClient } from "@tanstack/react-query"
import type { ListUsersParams } from "./../schema"

/**
 * Translate TanStack DB predicates to User query parameters
 */
function translateUserPredicates(
  options?: LoadSubsetOptions
): Partial<ListUsersParams> {
  if (!options) return {}

  const parsed = parseLoadSubsetOptions(options)
  const params: Record<string, unknown> = {}

  // Map filters to query params
  for (const filter of parsed.filters) {
    const fieldName = filter.field.join(".")
    switch (filter.operator) {
      case "eq":
        params[fieldName] = filter.value
        break
      case "lt":
        params[`${fieldName}_lt`] = filter.value
        break
      case "lte":
        params[`${fieldName}_lte`] = filter.value
        break
      case "gt":
        params[`${fieldName}_gt`] = filter.value
        break
      case "gte":
        params[`${fieldName}_gte`] = filter.value
        break
      case "in":
        params[`${fieldName}_in`] = filter.value
        break
      // Silently ignore unsupported operators
    }
  }

  // Map sorting
  if (parsed.sorts.length > 0) {
    params["sort"] = parsed.sorts
      .map((s) => `${s.direction === "desc" ? "-" : ""}${s.field.join(".")}`)
      .join(",")
  }

  // Map pagination (limit from parsed, offset from original options)
  if (parsed.limit != null) params["limit"] = parsed.limit
  if (options.offset != null) params["offset"] = options.offset

  return params as Partial<ListUsersParams>
}

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

/**
 * Collection options for User
 * @remarks Uses on-demand sync mode with predicate push-down
 */
export const userCollectionOptions = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions({
      queryKey: ["User"],
      syncMode: "on-demand",
      queryFn: async (ctx) => {
        const params = translateUserPredicates(ctx.meta?.loadSubsetOptions)
        const response = await listUsers(params)
        return response.data
      },
      queryClient,
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => createUser({ body: m.modified })))
      },
      onUpdate: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => updateUser({ userId: m.original.id, body: m.changes })))
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(transaction.mutations.map((m) => deleteUser({ userId: m.key })))
      },
    })
  )

