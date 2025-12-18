---
"tangrams": patch
---

Change OpenAPI client from static `$fetch` instance to async `getClient()` function pattern, matching the GraphQL client approach. This allows users to add dynamic headers (e.g., auth tokens) that require async operations.

**Breaking Change:** If you have customized your OpenAPI `client.ts` file, you will need to migrate from the `$fetch` export to the new `getClient()` async function pattern.
