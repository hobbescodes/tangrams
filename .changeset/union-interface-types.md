---
"tangen": minor
---

Add support for GraphQL union and interface types in generated TypeScript output. Previously, fields returning union types (e.g., `SearchResult = User | Post`) or interface types (e.g., `Node`) would generate `unknown`. Now they generate proper discriminated unions with `__typename` for type narrowing. Warnings are emitted when union/interface fields are queried without inline fragments.
