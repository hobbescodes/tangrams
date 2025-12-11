# tangen

## 0.9.0

### Minor Changes

- e00fc17: Add multi-source configuration and OpenAPI support

  ## New Features

  ### Multi-Source Configuration

  tangen now supports multiple data sources in a single configuration file. This enables you to generate TanStack Query helpers from both GraphQL endpoints and OpenAPI specs in one project.

  ```typescript
  import { defineConfig } from "tangen";

  export default defineConfig({
    sources: [
      {
        name: "graphql-api",
        type: "graphql",
        schema: { url: "http://localhost:4000/graphql" },
        documents: "./src/graphql/**/*.graphql",
      },
      {
        name: "rest-api",
        type: "openapi",
        spec: "./openapi.yaml",
      },
    ],
    output: {
      dir: "./src/generated",
    },
  });
  ```

  With multiple sources, generated files are organized by source name:

  ```
  src/generated/
  ├── graphql-api/
  │   ├── client.ts
  │   ├── types.ts
  │   └── operations.ts
  └── rest-api/
      ├── client.ts
      ├── types.ts
      └── operations.ts
  ```

  ### OpenAPI Support

  Generate TanStack Query helpers from OpenAPI/Swagger specifications:

  - **Local and Remote Specs**: Load specs from local files or remote URLs
  - **Path Filtering**: Include/exclude specific API paths using glob patterns
  - **Zod Schema Generation**: Generates Zod schemas for runtime validation
  - **better-fetch Client**: Uses `@better-fetch/fetch` as the HTTP client
  - **Full Type Safety**: Generates TypeScript types inferred from Zod schemas

  OpenAPI source configuration options:

  - `spec`: Path to OpenAPI spec file (local path or URL)
  - `headers`: Headers for fetching remote specs (e.g., for authentication)
  - `include`: Glob patterns for paths to include (e.g., `["/users/**"]`)
  - `exclude`: Glob patterns for paths to exclude (e.g., `["/internal/**"]`)

  ### Watch Mode Improvements

  Watch mode now monitors:

  - GraphQL document files (`.graphql`)
  - Local OpenAPI spec files
  - Config file changes

  Remote specs (URLs) are cached and only re-fetched when pressing `r` to force refresh.

  ## New Peer Dependencies (for OpenAPI)

  If using OpenAPI sources, install the following peer dependencies:

  ```bash
  bun add @better-fetch/fetch zod
  ```

  These are optional - only required when using OpenAPI sources.

## 0.8.0

### Minor Changes

- eb9640a: Add support for GraphQL union and interface types in generated TypeScript output. Previously, fields returning union types (e.g., `SearchResult = User | Post`) or interface types (e.g., `Node`) would generate `unknown`. Now they generate proper discriminated unions with `__typename` for type narrowing. Warnings are emitted when union/interface fields are queried without inline fragments.

## 0.7.0

### Minor Changes

- 95abb98: Add watch mode to the generate command. Use `--watch` or `-w` flag to automatically regenerate when config or GraphQL document files change. Features include:

  - Watches config file and all GraphQL documents matching the configured patterns
  - Caches the schema between document changes for faster rebuilds
  - Debounces rapid file changes to avoid redundant regenerations
  - Press `r` to force refresh (re-introspects schema)
  - Press `q` to quit watch mode
  - Continues watching even if generation fails (e.g., invalid GraphQL syntax)

### Patch Changes

- 8f5fe75: Fix watch mode not detecting file changes with chokidar v5. Chokidar v4+ removed glob pattern support, so the watcher now extracts base directories from glob patterns and uses picomatch to filter file change events. This ensures that both existing file modifications and newly created files matching the document patterns trigger regeneration.

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
