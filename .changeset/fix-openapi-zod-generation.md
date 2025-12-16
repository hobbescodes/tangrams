---
"tangrams": patch
---

Fix OpenAPI Zod schema generation issues:

- Always generate request/response type aliases (e.g., `CreatePetResponse`, `GetPetResponse`) even when they reference existing schemas
- Fix topological sorting to ensure schema dependencies are declared before dependents
- Fix `import type` syntax in generated operations.ts (was incorrectly generating `import type { type Foo }`)

Fix TanStack Form options generation:

- Fix multi-line schema extraction for proper default value generation
- Generate proper default values from schema definitions instead of empty objects
- Add type assertion with inferred types to ensure proper type widening for default values (fixes array and enum type inference issues)

Fix unused type imports in generated functions.ts:

- Only import `*Params` types for GET operations (query functions), since mutation functions use inline types
