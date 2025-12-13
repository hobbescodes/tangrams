---
"tangrams": minor
---

Simplify generates config to array-only format and move scalars to overrides

**Breaking Changes:**

- `generates` config now only accepts an array of generators: `["query", "form", "db"]`
  - Object form with file customization is no longer supported
  - All filenames are now hardcoded (no customization)
- Removed `scalars` from source root - now at `overrides.scalars`
- Removed `functions` from generates array - functions.ts is auto-generated when `query` or `db` is enabled
- Output directory structure: `<source>/<generator>/` (e.g., `graphql/query/operations.ts`)
- `client.ts` and `schema.ts` are at the source root level, shared by all generators
- Removed `functionsImportPath` option - always imports from hardcoded `../functions` path

**New Config Structure:**

```typescript
export default defineConfig({
  sources: [
    {
      name: "graphql",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      generates: ["query", "db"],  // Array only, no object form
      overrides: {
        scalars: { DateTime: "Date" },  // Moved from source root
        db: {
          collections: { Pet: { keyField: "petId" } }
        }
      }
    }
  ]
})
```

**Migration:**

From:
```typescript
generates: { query: true, functions: true }
scalars: { DateTime: "Date" }
```

To:
```typescript
generates: ["query"]
overrides: {
  scalars: { DateTime: "Date" }
}
```

- `functions.ts` is now auto-generated when `query` or `db` is enabled (no need to specify)
- When `db` is specified, `query` is auto-enabled (db depends on functions which needs types)
