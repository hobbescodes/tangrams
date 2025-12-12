---
"tangen": minor
---

Restructure output to use unified `zod/<source>/schema.ts` for Zod schemas

**BREAKING CHANGE:** The output directory structure has changed. Zod schemas are now generated in a dedicated `zod/` directory instead of alongside query files.

**Before:**
```
src/generated/
├── query/<source>/
│   ├── client.ts
│   ├── types.ts       # Zod schemas + TS types (OpenAPI)
│   └── operations.ts
└── form/<source>/
    └── forms.ts
```

**After:**
```
src/generated/
├── zod/<source>/
│   └── schema.ts      # Zod schemas (OpenAPI always, GraphQL when form enabled)
├── query/<source>/
│   ├── client.ts
│   ├── types.ts       # TypeScript types (GraphQL only)
│   └── operations.ts
└── form/<source>/
    └── forms.ts
```

**Migration Guide:**

1. **OpenAPI sources:** Update imports from `./generated/query/<source>/types` to `./generated/zod/<source>/schema`
2. **GraphQL sources with query only:** No changes needed - TypeScript types remain in `query/<source>/types.ts`
3. **GraphQL sources with form:** Zod schemas now in `zod/<source>/schema.ts`, TS types remain in `query/<source>/types.ts`

**Key Changes:**
- OpenAPI: Zod schemas moved from `query/<source>/types.ts` to `zod/<source>/schema.ts`
- GraphQL: Zod schemas (when form enabled) now in `zod/<source>/schema.ts`
- GraphQL: TypeScript types remain in `query/<source>/types.ts` (unchanged)
- Form files now import from `../../zod/<source>/schema` instead of `../../query/<source>/types`
- Removed `generateTypes` method from OpenAPI adapter (use `generateSchemas` instead)
- Removed `mutationsOnly` and `requestBodiesOnly` options (schemas always include all types)
