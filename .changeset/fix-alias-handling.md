---
"tangen": patch
---

Fix type generation for GraphQL field aliases. Previously, aliased fields like `firstUser: user(id: "1")` would generate types with the schema field name (`user`) instead of the alias (`firstUser`). Now aliases are correctly reflected in generated TypeScript types.
