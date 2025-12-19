---
"tangrams": patch
---

Refactor code generators to use code-block-writer for consistent formatting

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
