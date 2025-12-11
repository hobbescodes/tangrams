# tangen

## 0.2.0

### Minor Changes

- 31c6267: Initial release of tangen - Generate TanStack Query artifacts from GraphQL schemas

  Features:

  - Schema introspection from GraphQL endpoints
  - TypeScript type generation for schema types, fragments, and operations
  - Generated `graphql-request` client with configurable headers
  - `queryOptions` generation for TanStack Query
  - `mutationOptions` generation for mutations
  - Fragment support with proper type composition
  - Custom scalar type mappings
  - Flexible configuration via `tangen.config.ts`
