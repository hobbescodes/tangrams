---
"tangen": minor
---

Add tree-shaking for generated TypeScript types. Only enums and input types that are actually referenced by your GraphQL documents are now generated, rather than the entire schema. This significantly reduces generated code size when you only use a subset of the API.

**Features:**
- Input types are collected from operation variable definitions
- Enums are collected from both variables and return type selections
- Transitive dependencies are automatically included (e.g., nested input types, enums in input fields)
- Circular input type references are handled correctly
- Schema types are now sorted alphabetically for predictable output and cleaner diffs
- Warnings are emitted for references to non-existent types (structured in `TypeGeneratorResult.warnings`)

**Breaking Change:**
The `generateTypes` function now returns `{ code: string, warnings: string[] }` instead of just a string.
