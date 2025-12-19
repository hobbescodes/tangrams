# tangrams

## 0.10.0

### Minor Changes

- 5ddbcf0: Add automatic `infiniteQueryOptions` generation for paginated queries

  - Automatically generates `infiniteQueryOptions` alongside `queryOptions` for operations with pagination
  - Supports cursor, offset, page, and Relay-style pagination patterns
  - Detects pagination from request parameters (`cursor`, `offset`, `page`, `after`, `first`) and response fields (`nextCursor`, `total`, `hasNextPage`, `pageInfo`)
  - Adds `"infinite"` segment to query keys to distinguish from regular queries
  - Uses `Omit<Params, "pageParam">` for clean developer experience
  - Configurable via `overrides.query.operations.<name>` for custom `getNextPageParamPath` or to disable generation

## 0.9.0

### Minor Changes

- 9b92c26: **Breaking Change:** Changed `output` config semantics.

  The `output` option now specifies where to place the `tangrams` folder, rather than the full output path. The `tangrams` directory name is now hardcoded and always appended to the configured output path.

  - **New default:** `"."` (project root)
  - **Old default:** `"./tangrams"`

  **Migration:**

  - If using the default config, no changes needed - output location remains `./tangrams/<source>/...`
  - If using a custom path like `output: "./src/generated"`, change to `output: "./src"` to generate at `./src/tangrams/<source>/...`

- b6cbccc: Rename generated output files for better clarity:

  - `query/operations.ts` → `query/options.ts`
  - `form/forms.ts` → `form/options.ts`

  This aligns naming with `db/collections.ts` by using descriptive file names that reflect their contents (query/mutation options and form options respectively).

  **Breaking Change:** Update your imports from `/query/operations` to `/query/options` and `/form/forms` to `/form/options`.

### Patch Changes

- 670ae9c: Refactor code generators to use code-block-writer for consistent formatting

  - Add code-block-writer dependency for structured code generation
  - Migrate all generators to use code-block-writer:
    - GraphQL functions generator
    - OpenAPI functions and operations generators
    - Query-options and form-options generators
    - Types generator
    - Predicates generator
    - Schema emitters (Zod, Valibot, ArkType)
    - OpenAPI collections generator
    - GraphQL collections generator
  - Fix lint warnings in generated code (template literals for fragment concatenation)
  - Add shared writer utilities in `@/utils/writer`
  - Consistent 2-space indentation across all generated files

## 0.8.0

### Minor Changes

- 1ec2d30: **BREAKING:** Changed default output directory from `./src/generated` to `./tangrams`.

  Users upgrading should either:

  - Update their imports to use the new default location
  - Explicitly set `output: "./src/generated"` in their config to maintain the previous behavior

  We recommend using a `@tangrams/*` path alias in your `tsconfig.json` for cleaner imports:

  ```json
  {
    "compilerOptions": {
      "paths": {
        "@tangrams/*": ["./tangrams/*"]
      }
    },
    "include": ["src", "tangrams"]
  }
  ```

### Patch Changes

- c76d9d6: Fix predicate translator imports and offset access in generated db collections

  - Import `LoadSubsetOptions` type from `@tanstack/db` instead of `@tanstack/query-db-collection` where it is not exported
  - Access `offset` from the original `options` object rather than from `parseLoadSubsetOptions()` return value, which only returns `{ filters, sorts, limit }`

## 0.7.0

### Minor Changes

- ec3a7a3: Add multi-validator support with Zod, Valibot, and ArkType

  - Add `validator` config option to choose between `"zod"` (default), `"valibot"`, or `"arktype"` for schema generation
  - Implement IR (Intermediate Representation) architecture that decouples spec parsing from code generation
  - Add dedicated emitters for each validator library with proper syntax and type inference
  - All three validators implement Standard Schema, ensuring compatibility with TanStack Form
  - Add `valibot` and `arktype` as optional peer dependencies
  - Update `buildQuery` function type to accept `null` values for nullish optional fields
  - Update documentation with validator configuration examples

### Patch Changes

- ec3a7a3: Fix ArkType emitter to generate nullish optional fields matching Zod/Valibot behavior
- 872b25e: Change OpenAPI client from static `$fetch` instance to async `getClient()` function pattern, matching the GraphQL client approach. This allows users to add dynamic headers (e.g., auth tokens) that require async operations.

  **Breaking Change:** If you have customized your OpenAPI `client.ts` file, you will need to migrate from the `$fetch` export to the new `getClient()` async function pattern.

- ec3a7a3: Fix validator schema generation issues discovered through runtime validation testing

  - Fix Valibot datetime format to use `v.pipe(v.string(), v.isoTimestamp())` instead of `v.isoDateTime()` for proper ISO 8601 validation with seconds and timezone
  - Fix property name double-quoting where names with special characters (e.g., `special-name`) were incorrectly quoted twice in generated schemas

## 0.6.2

### Patch Changes

- a9ec431: Improve GraphQL Zod schema generation for better type compatibility between query responses and mutation inputs.

  **Changes:**

  - **Use `.nullish()` for nullable fields** - Both input types and output types now use `.nullish()` instead of `.optional()` or `.nullable()` respectively. This provides seamless type compatibility when passing data from query responses to mutation functions (e.g., in TanStack DB collection persistence handlers).

  - **Fix list type nullability handling** - Fixed a bug where all list types incorrectly received `.nullable()` regardless of whether they were wrapped in NonNull. Now correctly handles:
    - `[String!]!` → `z.array(z.string())` (required array of required strings)
    - `[String]!` → `z.array(z.string().nullish())` (required array of nullable strings)
    - `[String!]` → `z.array(z.string()).nullish()` (optional array of required strings)

  **Why this matters:**

  GraphQL has different nullability semantics for inputs vs outputs:

  - Input nullable = "can omit this field" → TypeScript `undefined`
  - Output nullable = "can return null" → TypeScript `null`

  Using `.nullish()` (which accepts both `null` and `undefined`) eliminates type mismatches when collection item types (from queries) are passed to mutation input types, enabling proper type inference in generated TanStack DB collections without requiring type casts.

## 0.6.1

### Patch Changes

- ac07b33: Include README.md and LICENSE in published npm package by copying them from the monorepo root during build

## 0.6.0

### Minor Changes

- afadab0: TanStack Form generation improvements:

  **Simplified default values:**

  - Use empty object with type assertion (`{} as TypeName`) for `defaultValues` instead of generating default values from Zod schemas
  - Remove complex default value extraction and generation logic
  - Simplify both OpenAPI and GraphQL form generation adapters
  - Remove `defaults.ts` and related code (no longer needed)

  **Configurable form validators:**

  - Add `overrides.form.validator` option to configure which validator timing to use
  - Supported validators: `onChange`, `onChangeAsync`, `onBlur`, `onBlurAsync`, `onSubmit`, `onSubmitAsync` (default), `onDynamic`
  - Add `overrides.form.validationLogic` option for `onDynamic` validator with `mode` and `modeAfterSubmission` settings
  - Default `validationLogic` is `{ mode: "submit", modeAfterSubmission: "change" }` matching TanStack Form's common revalidation pattern

  Example configuration:

  ```typescript
  // tangrams.config.ts
  export default defineConfig({
    sources: [
      {
        name: "api",
        type: "openapi",
        spec: "./openapi.yaml",
        generates: ["form"],
        overrides: {
          form: {
            validator: "onDynamic",
            validationLogic: {
              mode: "submit",
              modeAfterSubmission: "change",
            },
          },
        },
      },
    ],
  });
  ```

- afadab0: Unify GraphQL type generation into schema.ts using Zod inference

  **Breaking Change:** GraphQL sources no longer generate a separate `query/types.ts` file. All types are now inferred from Zod schemas in `schema.ts`.

  Before:

  ```
  <source>/
    ├── schema.ts          # Zod schemas (only when form/db enabled)
    ├── query/
    │   ├── types.ts       # TypeScript types + enums
    │   └── operations.ts
  ```

  After:

  ```
  <source>/
    ├── schema.ts          # Zod schemas + inferred types (always when query/form/db enabled)
    ├── query/
    │   └── operations.ts
  ```

  Benefits:

  - Single source of truth for types (Zod schemas)
  - Consistent type inference between GraphQL and OpenAPI sources
  - Eliminates type mismatches between enum definitions and Zod schemas
  - Generated types use `z.infer<typeof schema>` pattern

  Migration:

  - Update imports from `./query/types` to `./schema`
  - Enum types are now string literal unions (e.g., `"dog" | "cat"` instead of `enum PetCategory { dog = "dog" }`)

### Patch Changes

- afadab0: Fix TanStack DB collection generation and standardize import structure in generated files.

  - Fix path parameter name mismatch in collection mutation handlers (was using entity `keyField` instead of API path parameter name)
  - Remove unused type imports from generated `collections.ts` files
  - Standardize import structure across all generated files to match biome.json import ordering:
    1. External packages (sorted alphabetically)
    2. Internal imports (sorted alphabetically)
    3. Type imports (sorted alphabetically)

- afadab0: Fix OpenAPI Zod schema generation issues:

  - Always generate request/response type aliases (e.g., `CreatePetResponse`, `GetPetResponse`) even when they reference existing schemas
  - Fix topological sorting to ensure schema dependencies are declared before dependents
  - Fix `import type` syntax in generated operations.ts (was incorrectly generating `import type { type Foo }`)

  Fix TanStack Form options generation:

  - Fix multi-line schema extraction for proper default value generation
  - Generate proper default values from schema definitions instead of empty objects
  - Add type assertion with inferred types to ensure proper type widening for default values (fixes array and enum type inference issues)

  Fix unused type imports in generated files:

  - Only import `*Params` types for GET operations in both `functions.ts` and `operations.ts`, since mutation functions inline their parameter types

  Fix GraphQL form generation:

  - Generate operation variable schemas (e.g., `createPetVariablesSchema`) in schema.ts when form generation is enabled
  - This fixes the missing exports error when forms.ts imports variable schemas from schema.ts

## 0.5.0

### Minor Changes

- 00c2338: Add on-demand sync mode for TanStack DB collections with predicate push-down support.

  - New `syncMode` config option for collections (`"full"` | `"on-demand"`)
  - New `predicateMapping` config option with 4 presets: `"rest-simple"`, `"jsonapi"`, `"hasura"`, `"prisma"`
  - Auto-detection of filter/sort/pagination capabilities from OpenAPI query parameters and GraphQL input types
  - Generated predicate translator functions that convert TanStack DB predicates to API-specific formats

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
