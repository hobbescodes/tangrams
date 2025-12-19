---
"tangrams": patch
---

Fix predicate translator imports and offset access in generated db collections

- Import `LoadSubsetOptions` type from `@tanstack/db` instead of `@tanstack/query-db-collection` where it is not exported
- Access `offset` from the original `options` object rather than from `parseLoadSubsetOptions()` return value, which only returns `{ filters, sorts, limit }`
