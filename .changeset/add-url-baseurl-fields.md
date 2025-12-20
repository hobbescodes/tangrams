---
"tangrams": minor
---

Add `url` field for GraphQL sources and `baseUrl` field for OpenAPI sources with environment variable support.

**New Features:**
- URLs can be specified as plain strings or env var templates (e.g., `"${API_URL}/graphql"`)
- Env var templates are output as template literals with `process.env` references in generated client code
- Both fields can override spec-derived URLs when provided

**Breaking Changes:**
- GraphQL file-based schemas now require a `url` field in the config
- OpenAPI sources without `servers` in the spec now require a `baseUrl` field

**Cleanup:**
- Removed unused legacy client generator (`generators/client.ts`)
- Consolidated duplicate naming utilities into `utils/naming.ts`
- Removed unnecessary re-export layer (`adapters/graphql/documents.ts`)
