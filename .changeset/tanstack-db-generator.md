---
"tangrams": minor
---

Add TanStack DB collection generator

- New `db` generator option to generate `queryCollectionOptions` for TanStack DB
- Auto-discovers entities from OpenAPI (GET endpoints returning arrays) and GraphQL (queries returning list types)
- Auto-detects key fields (`id` by default) with configurable overrides
- Maps CRUD mutations automatically:
  - OpenAPI: by path pattern (POST /pets, PUT /pets/{id}, DELETE /pets/{id})
  - GraphQL: by naming convention (createUser, updateUser, deleteUser)
- Generates factory functions that accept `QueryClient` for dependency injection
- Outputs to `<source>/db/collections.ts`
