---
"tangen": minor
---

Restructure config from library-centric to source-centric

**BREAKING CHANGE:** The configuration structure has been completely redesigned. Sources are now defined at the top level with a `generates` property specifying what to generate.

**Before:**
```typescript
defineConfig({
  query: {
    sources: [{ name: "api", type: "openapi", spec: "./openapi.yaml" }],
  },
  form: {
    sources: [{ name: "api", type: "openapi", spec: "./openapi.yaml" }],
  },
})
```

**After:**
```typescript
defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "./openapi.yaml",
      generates: ["query", "form"],
    },
  ],
})
```

Key changes:
- `query.sources` and `form.sources` are replaced with top-level `sources` array
- Each source has a required `generates` property (array or object form)
- File customization is now per-source via `generates: { query: { files: {...} } }`
- No more duplicate source definitions when generating multiple outputs
