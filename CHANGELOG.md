# tangrams

## 0.2.0

### Minor Changes

- c4ac89e: Restructure config from library-centric to source-centric

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
  });
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
  });
  ```

  Key changes:

  - `query.sources` and `form.sources` are replaced with top-level `sources` array
  - Each source has a required `generates` property (array or object form)
  - File customization is now per-source via `generates: { query: { files: {...} } }`
  - No more duplicate source definitions when generating multiple outputs

- c4ac89e: Add TanStack Form support with `formOptions` generation

  - Add `form` to the `generates` array for generating TanStack Form artifacts
  - Generate Zod schemas from mutation inputs (GraphQL input types, OpenAPI request bodies)
  - Generate `formOptions` with:
    - `defaultValues` - Empty defaults based on schema types
    - `validators.onSubmitAsync` - Zod schema for validation
  - Support both GraphQL and OpenAPI sources
  - Output structure: `zod/<source>/schema.ts` for Zod schemas, `form/<source>/forms.ts` for form options

- 60621c2: Restructure output to use unified `zod/<source>/schema.ts` for Zod schemas

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

- 309fa22: Upgrade to Zod v4. Generated OpenAPI types now use Zod v4 top-level validators (e.g., `z.email()` instead of `z.string().email()`, `z.iso.datetime()` instead of `z.string().datetime()`). The peer dependency has been updated to require Zod >=4.0.0.

  **Breaking Changes:**

  - Zod peer dependency now requires v4.0.0 or higher
  - Generated OpenAPI type imports changed from `import { z } from "zod"` to `import * as z from "zod"`
  - String format validators use new top-level APIs: `z.email()`, `z.url()`, `z.uuid()`, `z.ipv4()`, `z.ipv6()`, `z.iso.datetime()`, `z.iso.date()`, `z.iso.time()`

## 0.1.0

Initial release of tangrams - Code generation for the TanStack ecosystem.

### Features

- **TanStack Query** - Generate type-safe `queryOptions` and `mutationOptions`
- **TanStack Form** - Generate type-safe `formOptions` with Zod validation schemas
- **GraphQL Support** - Via introspection endpoint or local SDL files
- **OpenAPI Support** - Via spec file (local or remote URL)
- **Watch Mode** - Automatic regeneration on file changes
- **Zod v4** - Full Zod v4 support for schema generation
- **Source-centric Config** - Define sources once, generate multiple outputs
