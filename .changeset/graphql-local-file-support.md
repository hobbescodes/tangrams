---
"tangen": minor
---

Add local file support for GraphQL schema generation

GraphQL sources can now load schema from local SDL files instead of requiring a live introspection endpoint. This is useful for:
- Offline development when the GraphQL server isn't running
- Working with schema files exported from tools like Apollo Studio or GraphQL Codegen
- Projects that version control their schema files

**New configuration option:**

```typescript
// File-based schema (new)
{
  name: "api",
  type: "graphql",
  schema: {
    file: "./schema.graphql",
    // Or multiple files/patterns:
    // file: ["./schema.graphql", "./extensions/**/*.graphql"],
  },
  documents: "./src/graphql/**/*.graphql",
}

// URL-based schema (existing, still supported)
{
  name: "api",
  type: "graphql",
  schema: {
    url: "http://localhost:4000/graphql",
    headers: { ... },
  },
  documents: "./src/graphql/**/*.graphql",
}
```

The `schema.file` option accepts:
- A single file path: `"./schema.graphql"`
- A glob pattern: `"./schemas/**/*.graphql"`
- An array of paths/patterns: `["./schema.graphql", "./extensions/*.graphql"]`
