# tangrams

## 0.4.0

### Minor Changes

- e58e1ea: Simplify generates config to array-only format and move scalars to overrides

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
        generates: ["query", "db"], // Array only, no object form
        overrides: {
          scalars: { DateTime: "Date" }, // Moved from source root
          db: {
            collections: { Pet: { keyField: "petId" } },
          },
        },
      },
    ],
  });
  ```

  **Migration:**

  From:

  ```typescript
  generates: { query: true, functions: true }
  scalars: { DateTime: "Date" }
  ```

  To:

  ```typescript
  generates: ["query"];
  overrides: {
    scalars: {
      DateTime: "Date";
    }
  }
  ```

  - `functions.ts` is now auto-generated when `query` or `db` is enabled (no need to specify)
  - When `db` is specified, `query` is auto-enabled (db depends on functions which needs types)

- e58e1ea: Add TanStack DB collection generator

  - New `db` generator option to generate `queryCollectionOptions` for TanStack DB
  - Auto-discovers entities from OpenAPI (GET endpoints returning arrays) and GraphQL (queries returning list types)
  - Auto-detects key fields (`id` by default) with configurable overrides
  - Maps CRUD mutations automatically:
    - OpenAPI: by path pattern (POST /pets, PUT /pets/{id}, DELETE /pets/{id})
    - GraphQL: by naming convention (createUser, updateUser, deleteUser)
  - Generates factory functions that accept `QueryClient` for dependency injection
  - Outputs to `<source>/db/collections.ts`

## 0.3.0

### Minor Changes

- 87997d0: Add TanStack Start server functions support for query generation

  - New `serverFunctions` option in query configuration wraps operations in `createServerFn`
  - GraphQL operations use type-only validation for server function inputs
  - OpenAPI operations use Zod schemas for runtime validation
  - Server functions use GET method for queries and POST method for mutations
  - Both server functions (`*Fn`) and query/mutation options are exported
  - Added `@tanstack/react-router` and `@tanstack/react-start` as optional peer dependencies

### Patch Changes

- 51a455d: Fix TanStack Start detection to check the user's `package.json` directly instead of using Node's module resolution. This fixes detection issues when running via `bunx` or in various monorepo setups.
