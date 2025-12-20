---
"tangrams": patch
---

Fix TypeScript compilation errors for ArkType and Effect validators:

- **ArkType**: Fix fragment spread handling in GraphQL schemas. Previously, spreading `.infer` inside `type({})` caused TypeScript to interpret property names like `"id"` as type keywords. Now uses `.and()` to properly merge fragment schemas.

- **Effect**: Fix array and optional field compatibility with TanStack DB collections:
  - Wrap arrays with `Schema.mutable()` to produce mutable array types (`T[]` instead of `readonly T[]`)
  - Change optional fields from `Schema.NullishOr(T)` to `Schema.optional(Schema.NullOr(T))` to make keys truly optional in TypeScript, matching `Partial<T>` semantics
