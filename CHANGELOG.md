# tangen

## 0.6.0

### Minor Changes

- c5f536e: Add tree-shaking for generated TypeScript types. Only enums and input types that are actually referenced by your GraphQL documents are now generated, rather than the entire schema. This significantly reduces generated code size when you only use a subset of the API.

  **Features:**

  - Input types are collected from operation variable definitions
  - Enums are collected from both variables and return type selections
  - Transitive dependencies are automatically included (e.g., nested input types, enums in input fields)
  - Circular input type references are handled correctly
  - Schema types are now sorted alphabetically for predictable output and cleaner diffs
  - Warnings are emitted for references to non-existent types (structured in `TypeGeneratorResult.warnings`)

  **Breaking Change:**
  The `generateTypes` function now returns `{ code: string, warnings: string[] }` instead of just a string.

## 0.5.1

### Patch Changes

- 0a0d5ab: Optimize generated operations imports to only include what's actually used. TanStack Query imports now only include `queryOptions` or `mutationOptions` based on the operations defined, and type imports no longer include unused variables types for operations without variables.

## 0.5.0

### Minor Changes

- c32d947: Add automatic `.env` file loading for environment variables in config files. Environment variables defined in `.env` are now available when evaluating `tangen.config.ts`. Added `--env-file` flag to specify custom env files (can be used multiple times) and `--no-dotenv` flag to disable this behavior.

## 0.4.1

### Patch Changes

- 50c5cd4: Fix type generation for GraphQL field aliases. Previously, aliased fields like `firstUser: user(id: "1")` would generate types with the schema field name (`user`) instead of the alias (`firstUser`). Now aliases are correctly reflected in generated TypeScript types.
- 5567fa1: Fix CLI compatibility with Node.js by replacing Bun-specific `Bun.file().exists()` API with Node.js `fs/promises` access check.

## 0.4.0

### Minor Changes

- dd80cce: Use `mutationOptions` API from TanStack Query for generated mutation options instead of plain object literals. This provides better type safety and aligns with the `queryOptions` pattern.

## 0.3.0

### Minor Changes

- 2c77ce6: Change client generation to use async `getClient()` function pattern instead of a singleton. The client file is now only generated once and can be customized by users (e.g., for async auth headers). Use `--force` flag to regenerate all files including the client. Removed `client` config option as headers are now managed directly in the generated client file.

## 0.2.0

### Minor Changes

- 31c6267: Initial release of tangen - Generate TanStack Query artifacts from GraphQL schemas

  Features:

  - Schema introspection from GraphQL endpoints
  - TypeScript type generation for schema types, fragments, and operations
  - Generated `graphql-request` client with configurable headers
  - `queryOptions` generation for TanStack Query
  - `mutationOptions` generation for mutations
  - Fragment support with proper type composition
  - Custom scalar type mappings
  - Flexible configuration via `tangen.config.ts`
