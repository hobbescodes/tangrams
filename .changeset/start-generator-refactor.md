---
"tangrams": minor
---

Add standalone `start` generator and restructure output directories

**Breaking Changes:**

- Output directory structure has changed from `<generator>/<source>/` to `<source>/<generator>/`
  - Old: `src/generated/query/graphql/operations.ts`
  - New: `src/generated/graphql/query/operations.ts`
- `client.ts` and `schema.ts` are now at the source root level, shared by all generators
- Server functions are now generated in a separate `start/` directory instead of inline in `operations.ts`
- Config structure changed: `client` and `schema` filenames are now at the root of `generates`, not inside `query.files`

**New Features:**

- Add `start` generator for TanStack Start server functions
  - Can be used standalone: `generates: ["start"]`
  - Or with query: `generates: ["query", "start"]`
- When `serverFunctions: true` on query generator, operations import from `start/functions.ts`
- Server functions use `.inputValidator()` instead of `.validator()` per TanStack Start API

**Migration:**

Update your imports from:
```typescript
import { getUserQueryOptions } from "./generated/query/graphql/operations"
```

To:
```typescript
import { getUserQueryOptions } from "./generated/graphql/query/operations"
```

And if using server functions directly:
```typescript
import { getUserFn } from "./generated/graphql/start/functions"
```
