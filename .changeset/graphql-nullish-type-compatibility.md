---
"tangrams": patch
---

Improve GraphQL Zod schema generation for better type compatibility between query responses and mutation inputs.

**Changes:**

- **Use `.nullish()` for nullable fields** - Both input types and output types now use `.nullish()` instead of `.optional()` or `.nullable()` respectively. This provides seamless type compatibility when passing data from query responses to mutation functions (e.g., in TanStack DB collection persistence handlers).

- **Fix list type nullability handling** - Fixed a bug where all list types incorrectly received `.nullable()` regardless of whether they were wrapped in NonNull. Now correctly handles:
  - `[String!]!` → `z.array(z.string())` (required array of required strings)
  - `[String]!` → `z.array(z.string().nullish())` (required array of nullable strings)
  - `[String!]` → `z.array(z.string()).nullish()` (optional array of required strings)

**Why this matters:**

GraphQL has different nullability semantics for inputs vs outputs:
- Input nullable = "can omit this field" → TypeScript `undefined`
- Output nullable = "can return null" → TypeScript `null`

Using `.nullish()` (which accepts both `null` and `undefined`) eliminates type mismatches when collection item types (from queries) are passed to mutation input types, enabling proper type inference in generated TanStack DB collections without requiring type casts.
