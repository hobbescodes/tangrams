---
"tangrams": minor
---

Add standalone functions generator and refactor to new architecture

**Breaking Changes:**

- Output directory structure has changed from `<generator>/<source>/` to `<source>/<generator>/`
  - Old: `src/generated/query/graphql/operations.ts`
  - New: `src/generated/graphql/query/operations.ts`
- `client.ts` and `schema.ts` are now at the source root level, shared by all generators
- Replaced `start` generator with `functions` generator - generates standalone async functions at source root instead of createServerFn wrappers in start/ subdirectory
- Removed `serverFunctions` option from query config - use the separate `functions` generator instead
- Removed `@tanstack/react-router` and `@tanstack/react-start` peer dependencies

**New Features:**

- Add `functions` generator for standalone fetch functions
  - Generates simple async functions that can be used anywhere
  - Generated at source root: `<source>/functions.ts`
  - Can be used standalone: `generates: ["functions"]`
  - Or with query: `generates: ["functions", "query"]`
- Query operations and DB collections can now import from functions.ts using `functionsImportPath`
- TanStack DB collection generator (also new in this release)
  - New `db` generator option to generate `queryCollectionOptions`
  - Auto-discovers entities from OpenAPI and GraphQL schemas
  - Auto-detects key fields with configurable overrides
  - Maps CRUD mutations automatically
  - Collections import from functions.ts for fetch logic

**Migration:**

Update your config from:
```typescript
generates: ["query", "start"]
// or
generates: { query: { serverFunctions: true }, start: true }
```

To:
```typescript
generates: ["functions", "query"]
```

Update your imports from:
```typescript
import { getUserQueryOptions } from "./generated/query/graphql/operations"
import { getUserFn } from "./generated/graphql/start/functions"
```

To:
```typescript
import { getUserQueryOptions } from "./generated/graphql/query/operations"
import { getUser } from "./generated/graphql/functions"
```

Note: Function names no longer have the `Fn` suffix (e.g., `getUser` instead of `getUserFn`)
