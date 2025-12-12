# tangen

> Code generation for the TanStack ecosystem

[![npm version](https://img.shields.io/npm/v/tangen.svg)](https://www.npmjs.com/package/tangen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pkg.pr.new](https://pkg.pr.new/badge/hobbescodes/tangen)](https://pkg.pr.new/~/hobbescodes/tangen)

> [!WARNING]
> This project is in **alpha** and under active development. APIs may change without notice. **Do not use in production.**

## Overview

tangen is a comprehensive code generation tool for the TanStack ecosystem. It takes your schema and generates fully typed, ready-to-use artifacts for TanStack libraries.

Currently supporting **TanStack Query** with more integrations on the way.

## Features

- **TanStack Query** - Generate type-safe `queryOptions` and `mutationOptions` from your GraphQL operations or OpenAPI specs
- **TanStack Form** - Generate type-safe `formOptions` with Zod validation schemas from your mutations
- **TanStack DB** - Generate collection definitions from your schema _(coming soon)_
- **TanStack Pacer** - Generate rate-limited operation wrappers _(coming soon)_

## Supported Data Sources

- **GraphQL** - Via introspection endpoint or local SDL files
- **OpenAPI** - Via spec file (local or remote URL)

## Installation

```bash
# bun
bun add -D tangen

# npm
npm install -D tangen

# pnpm
pnpm add -D tangen
```

### Peer Dependencies

tangen generates code that uses these packages, so you'll need them in your project:

**For GraphQL sources:**

```bash
bun add @tanstack/react-query graphql-request
```

**For OpenAPI sources:**

```bash
bun add @tanstack/react-query @better-fetch/fetch zod
```

## Quick Start

### GraphQL

1. **Initialize configuration**

   ```bash
   bunx tangen init
   ```

   This creates a `tangen.config.ts` file in your project root.

2. **Configure your schema source**

   Edit `tangen.config.ts` with your GraphQL schema source. You can use either a URL for introspection or local SDL files:

   **Option A: URL-based (introspection)**

   ```typescript
   import { defineConfig } from "tangen";

   export default defineConfig({
     sources: [
       {
         name: "graphql",
         type: "graphql",
         schema: {
           url: "http://localhost:4000/graphql",
         },
         documents: "./src/graphql/**/*.graphql",
         generates: ["query"],
       },
     ],
   });
   ```

   **Option B: File-based (local SDL files)**

   ```typescript
   import { defineConfig } from "tangen";

   export default defineConfig({
     sources: [
       {
         name: "graphql",
         type: "graphql",
         schema: {
           file: "./schema.graphql",
           // Or use glob patterns for multiple files:
           // file: ["./schema.graphql", "./extensions/**/*.graphql"],
         },
         documents: "./src/graphql/**/*.graphql",
         generates: ["query"],
       },
     ],
   });
   ```

3. **Create your GraphQL operations**

   Create `.graphql` files with your queries, mutations, and fragments:

   ```graphql
   # src/graphql/user.graphql

   fragment UserFields on User {
     id
     name
     email
   }

   query GetUser($id: ID!) {
     user(id: $id) {
       ...UserFields
     }
   }

   mutation CreateUser($input: CreateUserInput!) {
     createUser(input: $input) {
       ...UserFields
     }
   }
   ```

4. **Generate code**

   ```bash
   bunx tangen generate
   ```

5. **Use the generated code**

   ```typescript
   import { useQuery, useMutation } from "@tanstack/react-query";
   import {
     getUserQueryOptions,
     createUserMutationOptions,
   } from "./generated/query/graphql/operations";

   // In your component
   function UserProfile({ userId }: { userId: string }) {
     const { data, isLoading } = useQuery(getUserQueryOptions({ id: userId }));

     if (isLoading) return <div>Loading...</div>;

     return <div>Hello, {data?.user?.name}</div>;
   }

   function CreateUserForm() {
     const { mutate, isPending } = useMutation(createUserMutationOptions());

     const handleSubmit = (data: { name: string; email: string }) => {
       mutate({ input: data });
     };

     // ...
   }
   ```

### OpenAPI

1. **Initialize configuration**

   ```bash
   bunx tangen init
   ```

2. **Configure your OpenAPI spec**

   Edit `tangen.config.ts` to use an OpenAPI source:

   ```typescript
   import { defineConfig } from "tangen";

   export default defineConfig({
     sources: [
       {
         name: "api",
         type: "openapi",
         spec: "./openapi.yaml", // or a remote URL
         generates: ["query"],
         // Optional: filter paths
         // include: ["/users/**", "/posts/**"],
         // exclude: ["/internal/**"],
       },
     ],
   });
   ```

3. **Generate code**

   ```bash
   bunx tangen generate
   ```

4. **Use the generated code**

   ```typescript
   import { useQuery, useMutation } from "@tanstack/react-query";
   import {
     listUsersQueryOptions,
     createUserMutationOptions,
   } from "./generated/query/api/operations";

   function UserList() {
     const { data, isLoading } = useQuery(
       listUsersQueryOptions({ limit: 10, offset: 0 })
     );

     if (isLoading) return <div>Loading...</div>;

     return (
       <ul>
         {data?.map((user) => (
           <li key={user.id}>{user.name}</li>
         ))}
       </ul>
     );
   }
   ```

## Configuration

tangen uses a source-centric configuration where each source specifies what it generates:

```typescript
import { defineConfig } from "tangen";

export default defineConfig({
  output: "./src/generated", // optional, defaults to "./src/generated"
  sources: [
    // GraphQL with URL-based schema (introspection)
    {
      name: "graphql",
      type: "graphql",
      schema: {
        url: "http://localhost:4000/graphql",
        headers: {
          "x-api-key": process.env.API_KEY,
        },
      },
      documents: "./src/graphql/**/*.graphql",
      scalars: {
        DateTime: "Date",
      },
      generates: ["query"], // or ["query", "form"] for both
    },
    // OpenAPI source generating both query and form
    {
      name: "rest-api",
      type: "openapi",
      spec: "https://api.example.com/openapi.json",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
      },
      include: ["/users/**", "/posts/**"],
      exclude: ["/internal/**"],
      generates: ["query", "form"],
    },
  ],
});
```

### The `generates` Property

Each source must specify what to generate via the `generates` property. It accepts:

**Array form (uses default filenames):**

```typescript
generates: ["query"]           // Generate only TanStack Query code
generates: ["form"]            // Generate only TanStack Form code
generates: ["query", "form"]   // Generate both
```

**Object form (customize filenames):**

```typescript
generates: {
  query: {
    files: {
      client: "api-client.ts",      // default: "client.ts"
      types: "api-types.ts",        // default: "types.ts" (GraphQL only)
      operations: "api-ops.ts",     // default: "operations.ts"
    },
  },
  form: {
    files: {
      forms: "user-forms.ts",       // default: "forms.ts"
    },
  },
  zod: {
    files: {
      schema: "types.ts",           // default: "schema.ts"
    },
  },
}
```

**Note:** The `zod.files.schema` option controls the Zod schema filename in `zod/<source>/`. This is generated automatically for OpenAPI sources and for GraphQL sources when form generation is enabled.

### GraphQL Source Options

| Option     | Type                     | Required | Description                                |
| ---------- | ------------------------ | -------- | ------------------------------------------ |
| `name`     | `string`                 | Yes      | Unique name for this source                |
| `type`     | `"graphql"`              | Yes      | Source type                                |
| `schema`   | `object`                 | Yes      | Schema configuration (see below)           |
| `documents` | `string \| string[]`    | Yes      | Glob pattern(s) for `.graphql` operation files |
| `scalars`  | `Record<string, string>` | No       | Custom scalar type mappings                |
| `generates` | `array \| object`       | Yes      | What to generate (see above)               |

#### Schema Configuration (choose one)

**URL-based (introspection):**

| Option           | Type                     | Required | Description                                |
| ---------------- | ------------------------ | -------- | ------------------------------------------ |
| `schema.url`     | `string`                 | Yes      | GraphQL endpoint URL for introspection     |
| `schema.headers` | `Record<string, string>` | No       | Headers to send with introspection request |

**File-based (local SDL files):**

| Option        | Type                  | Required | Description                                    |
| ------------- | --------------------- | -------- | ---------------------------------------------- |
| `schema.file` | `string \| string[]`  | Yes      | Path or glob pattern(s) for `.graphql` schema files |

### OpenAPI Source Options

| Option    | Type                     | Required | Description                                |
| --------- | ------------------------ | -------- | ------------------------------------------ |
| `name`    | `string`                 | Yes      | Unique name for this source                |
| `type`    | `"openapi"`              | Yes      | Source type                                |
| `spec`    | `string`                 | Yes      | Path to OpenAPI spec (local file or URL)   |
| `headers` | `Record<string, string>` | No       | Headers for fetching remote spec           |
| `include` | `string[]`               | No       | Glob patterns for paths to include         |
| `exclude` | `string[]`               | No       | Glob patterns for paths to exclude         |
| `generates` | `array \| object`      | Yes      | What to generate (see above)               |

### Global Options

| Option   | Type     | Required | Description                                                  |
| -------- | -------- | -------- | ------------------------------------------------------------ |
| `output` | `string` | No       | Output directory for generated files (default: `./src/generated`) |

### Output Directory Structure

Generated files are organized by generator type and source name:

```
src/generated/
├── zod/
│   └── rest-api/          # Zod schemas (OpenAPI always, GraphQL when form enabled)
│       └── schema.ts      # Zod schemas + inferred TypeScript types
├── query/
│   ├── graphql/           # GraphQL source output
│   │   ├── client.ts      # graphql-request client
│   │   ├── types.ts       # TypeScript types (from schema)
│   │   └── operations.ts  # TanStack Query helpers
│   └── rest-api/          # OpenAPI source output
│       ├── client.ts      # better-fetch client
│       └── operations.ts  # TanStack Query helpers (imports from zod/)
└── form/
    └── rest-api/          # Source with form generation
        └── forms.ts       # TanStack Form helpers (imports from zod/)
```

**Note:** OpenAPI sources generate Zod schemas in `zod/<source>/schema.ts` which are used by both query operations and form options. GraphQL sources only generate Zod schemas when form generation is enabled.

### Default Scalar Mappings (GraphQL)

tangen includes sensible defaults for common scalars:

| GraphQL Scalar | TypeScript Type |
| -------------- | --------------- |
| `ID`           | `string`        |
| `String`       | `string`        |
| `Int`          | `number`        |
| `Float`        | `number`        |
| `Boolean`      | `boolean`       |
| `DateTime`     | `string`        |
| `Date`         | `string`        |
| `JSON`         | `unknown`       |
| `BigInt`       | `bigint`        |
| `UUID`         | `string`        |

Override any of these using the `scalars` config option.

## Generated Output

### GraphQL Output

#### `client.ts`

A configured `graphql-request` client:

```typescript
import { GraphQLClient } from "graphql-request";

const endpoint = "http://localhost:4000/graphql";

export const getClient = async () => {
  return new GraphQLClient(endpoint, {
    headers: {
      // Add your headers here
    },
  });
};
```

#### `types.ts`

TypeScript types generated from your schema and operations:

```typescript
// Schema types
export type CreateUserInput = {
  name: string;
  email: string;
};

export enum UserRole {
  ADMIN = "ADMIN",
  USER = "USER",
}

// Fragment types
export type UserFieldsFragment = {
  id: string;
  name: string;
  email: string;
};

// Operation types
export type GetUserQueryVariables = { id: string };
export type GetUserQuery = { user: UserFieldsFragment | null };
```

#### `operations.ts`

Ready-to-use `queryOptions` and `mutationOptions`:

```typescript
export const getUserQueryOptions = (variables: GetUserQueryVariables) =>
  queryOptions({
    queryKey: ["graphql", "GetUser", variables],
    queryFn: async () =>
      (await getClient()).request<GetUserQuery>(GetUserDocument, variables),
  });

export const createUserMutationOptions = () =>
  mutationOptions({
    mutationKey: ["graphql", "CreateUser"],
    mutationFn: async (variables: CreateUserMutationVariables) =>
      (await getClient()).request<CreateUserMutation>(
        CreateUserDocument,
        variables
      ),
  });
```

### OpenAPI Output

#### `zod/<source>/schema.ts`

Zod schemas and TypeScript types from OpenAPI components:

```typescript
import * as z from "zod";

// Zod Schemas
export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});

export const createUserRequestSchema = z.object({
  name: z.string(),
  email: z.email(),
});

// TypeScript Types (inferred from Zod schemas)
export type User = z.infer<typeof userSchema>;
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

// Operation parameter types
export type ListUsersParams = {
  limit?: number;
  offset?: number;
};
```

#### `query/<source>/client.ts`

A configured `better-fetch` client with path/query helpers:

```typescript
import { createFetch } from "@better-fetch/fetch";

const baseURL = "https://api.example.com/v1";

export const $fetch = createFetch({
  baseURL,
  // Customize headers, retry logic, etc.
});

export function buildPath(
  template: string,
  params: Record<string, string | number>
): string {
  // Substitutes {param} placeholders in URL templates
}

export function buildQuery(
  params: Record<string, string | number | boolean | undefined>
): string {
  // Builds query strings from params objects
}
```

#### `query/<source>/operations.ts`

TanStack Query helpers using better-fetch (imports from `zod/<source>/schema.ts`):

```typescript
export const listUsersQueryOptions = (params: ListUsersParams) =>
  queryOptions({
    queryKey: ["api", "listUsers", params],
    queryFn: async () => {
      const query = buildQuery({ limit: params.limit, offset: params.offset });
      const url = query ? `/users?${query}` : "/users";
      const { data, error } = await $fetch<ListUsersResponse>(url, {
        output: listUsersResponseSchema,
      });
      if (error) throw error;
      return data;
    },
  });

export const createUserMutationOptions = () =>
  mutationOptions({
    mutationKey: ["api", "createUser"],
    mutationFn: async (body: CreateUserRequest) => {
      const { data, error } = await $fetch<CreateUserResponse>("/users", {
        method: "POST",
        output: createUserResponseSchema,
        body,
      });
      if (error) throw error;
      return data;
    },
  });
```

## CLI Reference

### `tangen init`

Initialize a new `tangen.config.ts` file.

```bash
tangen init [options]

Options:
  -f, --force           Overwrite existing config file
```

Example:

```bash
bunx tangen init
```

### `tangen generate`

Generate TypeScript code from your configured sources.

```bash
tangen generate [options]

Options:
  -c, --config <path>     Path to config file
  -f, --force             Force regeneration of all files including client
  -w, --watch             Watch for file changes and regenerate automatically
  --env-file <path>       Path to env file (can be specified multiple times)
  --no-dotenv             Disable automatic .env file loading
```

#### Watch Mode

When using `--watch`, tangen will:

- Watch your config file for changes
- Watch GraphQL documents (`.graphql` files) for changes
- Watch local OpenAPI spec files for changes
- Cache schemas between file changes for faster rebuilds
- Continue watching even if generation fails (e.g., invalid syntax)

Interactive commands in watch mode:

- Press `r` to force a full refresh (re-fetches all schemas including remote)
- Press `q` to quit

Example:

```bash
# Start watching for changes
bunx tangen generate --watch

# Watch with a custom config file
bunx tangen generate --watch --config ./config/tangen.config.ts
```

## TanStack Form Integration

tangen can generate `formOptions` for TanStack Form, complete with Zod validation schemas and default values derived from your mutations.

### Configuration

Add `"form"` to your source's `generates` array:

```typescript
import { defineConfig } from "tangen";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "./openapi.yaml",
      generates: ["query", "form"], // Generate both query and form code
    },
  ],
});
```

### Peer Dependencies

For form generation, you'll need:

```bash
bun add @tanstack/react-form zod
```

### Generated Output

When you run `tangen generate`, it creates:

```
src/generated/
├── zod/api/
│   └── schema.ts      # Zod schemas for all types
├── query/api/
│   ├── client.ts
│   └── operations.ts  # imports from zod/api/schema
└── form/api/
    └── forms.ts       # formOptions (imports from zod/api/schema)
```

#### `form/<source>/forms.ts`

Ready-to-use `formOptions` with validation and default values:

```typescript
import { formOptions } from "@tanstack/react-form";
import { createUserRequestSchema } from "../../zod/api/schema";

export const createUserFormOptions = formOptions({
  defaultValues: {
    name: "",
    email: "",
  },
  validators: {
    onSubmitAsync: createUserRequestSchema,
  },
});
```

### Usage

Use the generated form options with TanStack Form:

```typescript
import { useForm } from "@tanstack/react-form";
import { createUserFormOptions } from "./generated/form/api/forms";

function CreateUserForm() {
  const form = useForm({
    ...createUserFormOptions,
    onSubmit: async ({ value }) => {
      // value is fully typed as CreateUserInput
      await api.createUser(value);
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field
        name="name"
        children={(field) => (
          <input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      />
      {/* ... more fields */}
    </form>
  );
}
```

## Roadmap

- TanStack DB integration
- TanStack Pacer integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © hobbescodes
