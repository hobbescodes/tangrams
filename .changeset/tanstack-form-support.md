---
"tangen": minor
---

Add TanStack Form support with `formOptions` generation

- Add `form` configuration section for generating TanStack Form artifacts
- Generate Zod schemas from mutation inputs (GraphQL input types, OpenAPI request bodies)
- Generate `formOptions` with:
  - `defaultValues` - Empty defaults based on schema types
  - `validators.onSubmitAsync` - Zod schema for validation
- Support both GraphQL and OpenAPI sources
- Output structure: `schema/{source}/types.ts` and `form/{source}/forms.ts`
