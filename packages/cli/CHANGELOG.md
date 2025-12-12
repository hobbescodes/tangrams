# tangrams

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
