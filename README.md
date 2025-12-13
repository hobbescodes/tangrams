# tangrams

> Code generation for the TanStack ecosystem

[![npm version](https://img.shields.io/npm/v/tangrams.svg)](https://www.npmjs.com/package/tangrams)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pkg.pr.new](https://pkg.pr.new/badge/hobbescodes/tangrams)](https://pkg.pr.new/~/hobbescodes/tangrams)

> [!WARNING]
> This project is in **alpha** and under active development. APIs may change without notice. **Do not use in production.**

## Overview

tangrams is a comprehensive code generation tool for the TanStack ecosystem. It takes your schema and generates fully typed, ready-to-use artifacts for TanStack libraries.

Currently supporting **TanStack Query** and **TanStack Form** with more integrations on the way.

## Features

- **TanStack Query** - Generate type-safe `queryOptions` and `mutationOptions` from your GraphQL operations or OpenAPI specs
- **Standalone Functions** - Generate standalone async fetch functions for use directly or with any framework
- **TanStack Form** - Generate type-safe `formOptions` with Zod validation schemas from your mutations
- **TanStack DB** - Generate `queryCollectionOptions` with auto-detected CRUD operations for local-first data
- **TanStack Pacer** - Generate rate-limited operation wrappers _(coming soon)_

## Supported Data Sources

- **GraphQL** - Via introspection endpoint or local SDL files
- **OpenAPI** - Via spec file (local or remote URL)

## Installation

```bash
# bun
bun add -D tangrams

# npm
npm install -D tangrams

# pnpm
pnpm add -D tangrams
```

### Peer Dependencies

Install dependencies based on what you're generating:

**TanStack Query (`generates` includes `"query"`):**

```bash
bun add @tanstack/react-query
```

**TanStack Form (`generates` includes `"form"`):**

```bash
bun add @tanstack/react-form zod
```

**TanStack DB (`generates` includes `"db"`):**

```bash
bun add @tanstack/react-db @tanstack/query-db-collection @tanstack/react-query
```

**GraphQL sources (when generating `"query"`):**

```bash
bun add graphql-request
```

**OpenAPI sources (when generating `"query"`):**

```bash
bun add @better-fetch/fetch zod
```

## Quick Start

### GraphQL

1. **Initialize configuration**

   ```bash
   bunx tangrams init
   ```

   This creates a `tangrams.config.ts` file in your project root.

2. **Configure your schema source**

   Edit `tangrams.config.ts` with your GraphQL schema source. You can use either a URL for introspection or local SDL files:

   **Option A: URL-based (introspection)**

   ```typescript
   import { defineConfig } from "tangrams";

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
   import { defineConfig } from "tangrams";

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
   bunx tangrams generate
   ```

5. **Use the generated code**

   ```typescript
   import { useQuery, useMutation } from "@tanstack/react-query";
   import {
     getUserQueryOptions,
     createUserMutationOptions,
   } from "./generated/graphql/query/operations";

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
   bunx tangrams init
   ```

2. **Configure your OpenAPI spec**

   Edit `tangrams.config.ts` to use an OpenAPI source:

   ```typescript
   import { defineConfig } from "tangrams";

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
   bunx tangrams generate
   ```

4. **Use the generated code**

   ```typescript
   import { useQuery, useMutation } from "@tanstack/react-query";
   import {
     listUsersQueryOptions,
     createUserMutationOptions,
   } from "./generated/api/query/operations";

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

tangrams uses a source-centric configuration where each source specifies what it generates:

```typescript
import { defineConfig } from "tangrams";

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
      generates: ["query"], // or ["query", "form", "db"] for all
      overrides: {
        scalars: { DateTime: "Date" },
      },
    },
    // OpenAPI source generating query, form, and db
    {
      name: "rest-api",
      type: "openapi",
      spec: "https://api.example.com/openapi.json",
      headers: {
        Authorization: `Bearer ${process.env.API_TOKEN}`,
      },
      include: ["/users/**", "/posts/**"],
      exclude: ["/internal/**"],
      generates: ["query", "form", "db"],
      overrides: {
        db: {
          collections: {
            User: { keyField: "uuid" },
          },
        },
      },
    },
  ],
});
```

### The `generates` Property

Each source must specify what to generate via the `generates` property. It accepts an array of generators:

```typescript
generates: ["query"]; // Generate TanStack Query code
generates: ["form"]; // Generate TanStack Form code
generates: ["db"]; // Generate TanStack DB collections (auto-enables query)
generates: ["query", "form"]; // Generate both query and form
generates: ["query", "form", "db"]; // Generate all three
```

**Available generators:**

- `"query"` - Generates `queryOptions` and `mutationOptions` for TanStack Query
- `"form"` - Generates `formOptions` with Zod validation for TanStack Form
- `"db"` - Generates `queryCollectionOptions` for TanStack DB (automatically enables `query`)

**Note:** When `db` is specified, `query` is automatically enabled since DB collections depend on the underlying fetch functions.

The `functions.ts` file (containing standalone fetch functions) is automatically generated when `query` or `db` is enabled. All files use hardcoded names - no filename customization is available.

### GraphQL Source Options

| Option      | Type                     | Required | Description                                    |
| ----------- | ------------------------ | -------- | ---------------------------------------------- |
| `name`      | `string`                 | Yes      | Unique name for this source                    |
| `type`      | `"graphql"`              | Yes      | Source type                                    |
| `schema`    | `object`                 | Yes      | Schema configuration (see below)               |
| `documents` | `string \| string[]`     | Yes      | Glob pattern(s) for `.graphql` operation files |
| `generates` | `array`                  | Yes      | What to generate: `["query", "form", "db"]`    |
| `overrides` | `object`                 | No       | Override scalars and DB collection settings    |

#### Overrides Configuration

```typescript
overrides: {
  scalars: {
    DateTime: "Date",   // Custom scalar type mappings
  },
  db: {
    collections: {
      User: { keyField: "uuid" },  // Override auto-detected key field
    },
  },
}
```

#### Schema Configuration (choose one)

**URL-based (introspection):**

| Option           | Type                     | Required | Description                                |
| ---------------- | ------------------------ | -------- | ------------------------------------------ |
| `schema.url`     | `string`                 | Yes      | GraphQL endpoint URL for introspection     |
| `schema.headers` | `Record<string, string>` | No       | Headers to send with introspection request |

**File-based (local SDL files):**

| Option        | Type                 | Required | Description                                         |
| ------------- | -------------------- | -------- | --------------------------------------------------- |
| `schema.file` | `string \| string[]` | Yes      | Path or glob pattern(s) for `.graphql` schema files |

### OpenAPI Source Options

| Option      | Type                     | Required | Description                              |
| ----------- | ------------------------ | -------- | ---------------------------------------- |
| `name`      | `string`                 | Yes      | Unique name for this source              |
| `type`      | `"openapi"`              | Yes      | Source type                              |
| `spec`      | `string`                 | Yes      | Path to OpenAPI spec (local file or URL) |
| `headers`   | `Record<string, string>` | No       | Headers for fetching remote spec         |
| `include`   | `string[]`               | No       | Glob patterns for paths to include       |
| `exclude`   | `string[]`               | No       | Glob patterns for paths to exclude       |
| `generates` | `array`                  | Yes      | What to generate: `["query", "form", "db"]` |
| `overrides` | `object`                 | No       | Override DB collection settings (see GraphQL section) |

### Global Options

| Option   | Type     | Required | Description                                                       |
| -------- | -------- | -------- | ----------------------------------------------------------------- |
| `output` | `string` | No       | Output directory for generated files (default: `./src/generated`) |

### Output Directory Structure

Generated files are organized by source name, with generators in subdirectories:

```
src/generated/
└── <source>/              # e.g., "graphql", "rest-api"
    ├── client.ts          # API client (shared)
    ├── schema.ts          # Zod schemas (OpenAPI always, GraphQL when form enabled)
    ├── functions.ts       # Standalone fetch functions (when using functions generator)
    ├── query/             # TanStack Query output
    │   ├── types.ts       # TypeScript types (GraphQL only)
    │   └── operations.ts  # queryOptions and mutationOptions
    ├── form/              # TanStack Form output
    │   └── forms.ts       # formOptions
    └── db/                # TanStack DB output
        └── collections.ts # queryCollectionOptions (imports from ../functions.ts)
```

**Note:** The `client.ts`, `schema.ts`, and `functions.ts` files are at the source root, shared by all generators. The `query/operations.ts` and `db/collections.ts` files automatically import from `functions.ts`.

### Default Scalar Mappings (GraphQL)

tangrams includes sensible defaults for common scalars:

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

#### `<source>/client.ts`

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

#### `<source>/query/types.ts`

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

#### `<source>/query/operations.ts`

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

#### `<source>/schema.ts`

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

#### `<source>/client.ts`

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

#### `<source>/query/operations.ts`

TanStack Query helpers using better-fetch (imports from `<source>/schema.ts`):

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

### `tangrams init`

Initialize a new `tangrams.config.ts` file.

```bash
tangrams init [options]

Options:
  -f, --force           Overwrite existing config file
```

Example:

```bash
bunx tangrams init
```

### `tangrams generate`

Generate TypeScript code from your configured sources.

```bash
tangrams generate [options]

Options:
  -c, --config <path>     Path to config file
  -f, --force             Force regeneration of all files including client
  -w, --watch             Watch for file changes and regenerate automatically
  --env-file <path>       Path to env file (can be specified multiple times)
  --no-dotenv             Disable automatic .env file loading
```

#### Watch Mode

When using `--watch`, tangrams will:

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
bunx tangrams generate --watch

# Watch with a custom config file
bunx tangrams generate --watch --config ./config/tangrams.config.ts
```

## TanStack Form Integration

tangrams can generate `formOptions` for TanStack Form, complete with Zod validation schemas and default values derived from your mutations.

### Configuration

Add `"form"` to your source's `generates` array:

```typescript
import { defineConfig } from "tangrams";

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

When you run `tangrams generate`, it creates:

```
src/generated/
└── api/
    ├── client.ts      # API client (shared)
    ├── schema.ts      # Zod schemas for all types
    ├── query/
    │   └── operations.ts  # imports from ../schema
    └── form/
        └── forms.ts       # formOptions (imports from ../schema)
```

#### `<source>/form/forms.ts`

Ready-to-use `formOptions` with validation and default values:

```typescript
import { formOptions } from "@tanstack/react-form";
import { createUserRequestSchema } from "../schema";

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
import { createUserFormOptions } from "./generated/api/form/forms";

function CreateUserForm() {
  const form = useForm({
    ...createUserFormOptions,
    onSubmit: async ({ value }) => {
      // value is fully typed as CreateUserInput
      await api.createUser(value);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
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

## Standalone Functions

tangrams automatically generates standalone async fetch functions when `query` or `db` is enabled. These functions provide a simple, typed interface for making API calls and are used internally by the generated `operations.ts` and `collections.ts` files.

### Generated Output

When `query` or `db` is in your `generates` array, tangrams creates standalone functions at the source root:

```
src/generated/
└── graphql/
    ├── client.ts
    ├── functions.ts       # Auto-generated standalone async fetch functions
    └── query/
        ├── types.ts
        └── operations.ts  # Imports from ../functions.ts
```

#### `<source>/functions.ts`

Standalone async functions for all operations:

```typescript
import { getClient } from "./client";
import type { GetUserQuery, GetUserQueryVariables } from "./query/types";

const GetUserDocument = `
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`;

export async function getUser(
  variables: GetUserQueryVariables
): Promise<GetUserQuery> {
  return (await getClient()).request<GetUserQuery>(GetUserDocument, variables);
}

export async function createUser(
  variables: CreateUserMutationVariables
): Promise<CreateUserMutation> {
  return (await getClient()).request<CreateUserMutation>(
    CreateUserDocument,
    variables
  );
}
```

#### `<source>/query/operations.ts`

Query options that import and use the standalone functions:

```typescript
import { getUser, createUser } from "../functions";

export const getUserQueryOptions = (variables: GetUserQueryVariables) =>
  queryOptions({
    queryKey: ["graphql", "GetUser", variables],
    queryFn: () => getUser(variables),
  });

export const createUserMutationOptions = () =>
  mutationOptions({
    mutationKey: ["graphql", "CreateUser"],
    mutationFn: (variables: CreateUserMutationVariables) =>
      createUser(variables),
  });
```

### Usage

Use the generated functions directly anywhere in your code:

```typescript
import { getUser, createUser } from "./generated/graphql/functions";

// Call directly in any context
const user = await getUser({ id: "123" });

// Use in server-side code, API routes, etc.
export async function GET(request: Request) {
  const user = await getUser({ id: "123" });
  return Response.json(user);
}
```

Or use with TanStack Query through the generated options:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getUserQueryOptions,
  createUserMutationOptions,
} from "./generated/graphql/query/operations";

function UserProfile({ userId }: { userId: string }) {
  const { data } = useQuery(getUserQueryOptions({ id: userId }));
  return <div>{data?.user?.name}</div>;
}
```

## TanStack DB Integration

tangrams can generate collection options for TanStack DB, enabling local-first data patterns with automatic CRUD operation mapping.

### Configuration

Add `"db"` to your source's `generates` array:

```typescript
import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "./openapi.yaml",
      generates: ["db"], // db auto-enables query
      // Or explicitly: generates: ["query", "db"]
    },
  ],
});
```

**Note:** When `"db"` is specified, `"query"` is automatically enabled since DB collections depend on the underlying fetch functions.

### Peer Dependencies

For DB generation, you'll need:

```bash
bun add @tanstack/db @tanstack/query-db @tanstack/react-query
```

### Entity Discovery

tangrams automatically discovers entities for collection generation:

**OpenAPI:**

- Finds GET endpoints returning arrays (e.g., `GET /pets` returning `Pet[]`)
- Maps CRUD operations by path pattern:
  - `POST /pets` → insert
  - `PUT /pets/{id}` or `PATCH /pets/{id}` → update
  - `DELETE /pets/{id}` → delete

**GraphQL:**

- Finds queries returning list types (e.g., `users: [User!]!`)
- Maps mutations by naming convention:
  - `createUser` → insert
  - `updateUser` → update
  - `deleteUser` or `removeUser` → delete

### Key Field Detection

By default, tangrams looks for an `id` field (or GraphQL `ID` type) as the key field. Override this per-entity using the `overrides` option:

```typescript
{
  name: "api",
  type: "openapi",
  spec: "./openapi.yaml",
  generates: ["db"],
  overrides: {
    db: {
      collections: {
        Pet: { keyField: "petId" },
        User: { keyField: "uuid" },
      },
    },
  },
}
```

### Generated Output

```
src/generated/
└── api/
    ├── client.ts
    ├── schema.ts
    ├── functions.ts       # Auto-generated standalone functions
    ├── query/
    │   └── operations.ts  # Imports from ../functions.ts
    └── db/
        └── collections.ts # Imports from ../functions.ts
```

#### `<source>/db/collections.ts`

Collection options with query and persistence handlers:

```typescript
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

import type { QueryClient } from "@tanstack/react-query";
import type { Pet } from "../schema";
import { listPets, createPet, updatePet, deletePet } from "../functions";

/**
 * Collection options for Pet
 */
export const petCollectionOptions = (queryClient: QueryClient) =>
  createCollection(
    queryCollectionOptions({
      queryKey: ["Pet"],
      queryFn: async () => listPets(),
      queryClient,
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) => createPet({ body: m.modified }))
        );
      },
      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) =>
            updatePet({ id: m.original.id, body: m.changes })
          )
        );
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map((m) => deletePet({ id: m.key }))
        );
      },
    })
  );
```

### Usage

Use the generated collection options with TanStack DB:

```typescript
import { useQueryClient } from "@tanstack/react-query";
import { petCollectionOptions } from "./generated/api/db/collections";

function PetList() {
  const queryClient = useQueryClient();
  const collection = petCollectionOptions(queryClient);

  // Use collection.state, collection.insert(), etc.
  const pets = collection.state;

  return (
    <ul>
      {pets.map((pet) => (
        <li key={pet.id}>{pet.name}</li>
      ))}
    </ul>
  );
}
```

## Roadmap

- TanStack Pacer integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © hobbescodes
