---
"tangrams": minor
---

Add automatic `infiniteQueryOptions` generation for paginated queries

- Automatically generates `infiniteQueryOptions` alongside `queryOptions` for operations with pagination
- Supports cursor, offset, page, and Relay-style pagination patterns
- Detects pagination from request parameters (`cursor`, `offset`, `page`, `after`, `first`) and response fields (`nextCursor`, `total`, `hasNextPage`, `pageInfo`)
- Adds `"infinite"` segment to query keys to distinguish from regular queries
- Uses `Omit<Params, "pageParam">` for clean developer experience
- Configurable via `overrides.query.operations.<name>` for custom `getNextPageParamPath` or to disable generation
