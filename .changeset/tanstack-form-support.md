---
"tangen": minor
---

Add TanStack Form support with `formOptions` generation

- Add `form` to the `generates` array for generating TanStack Form artifacts
- Generate Zod schemas from mutation inputs (GraphQL input types, OpenAPI request bodies)
- Generate `formOptions` with:
  - `defaultValues` - Empty defaults based on schema types
  - `validators.onSubmitAsync` - Zod schema for validation
- Support both GraphQL and OpenAPI sources
- Output structure: `zod/<source>/schema.ts` for Zod schemas, `form/<source>/forms.ts` for form options
