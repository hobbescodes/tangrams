---
"tangrams": patch
---

Fix OpenAPI Zod schema generation issues:

- Always generate request/response type aliases (e.g., `CreatePetResponse`, `GetPetResponse`) even when they reference existing schemas
- Fix topological sorting to ensure schema dependencies are declared before dependents
- Fix `import type` syntax in generated operations.ts (was incorrectly generating `import type { type Foo }`)
