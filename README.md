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
- **TanStack Start** - Optionally wrap operations in `createServerFn` for server-side data fetching
- **TanStack Form** - Generate type-safe `formOptions` with Zod validation schemas from your mutations
- **TanStack DB** - Generate collection definitions from your schema _(coming soon)_
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

**TanStack Start (when using `serverFunctions: true`):**

```bash
bun add @tanstack/react-router @tanstack/react-start
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
generates: ["query"]; // Generate only TanStack Query code
generates: ["form"]; // Generate only TanStack Form code
generates: ["query", "form"]; // Generate both
```

**Object form (customize filenames):**

```typescript
generates: {
  client: "api-client.ts",          // default: "client.ts" (at source root)
  schema: "api-schema.ts",          // default: "schema.ts" (at source root)
  query: {
    serverFunctions: true,           // import server functions from start/ directory
    files: {
      types: "api-types.ts",         // default: "types.ts" (GraphQL only)
      operations: "api-ops.ts",      // default: "operations.ts"
    },
  },
  start: {                           // generate server functions (TanStack Start)
    files: {
      functions: "server-fns.ts",    // default: "functions.ts"
    },
  },
  form: {
    files: {
      forms: "user-forms.ts",        // default: "forms.ts"
    },
  },
}
```

**Note:** The `client` and `schema` files are now at the source root level, shared by all generators. Server functions are generated in a separate `start/` directory when using the `start` generator.

### GraphQL Source Options

| Option      | Type                     | Required | Description                                    |
| ----------- | ------------------------ | -------- | ---------------------------------------------- |
| `name`      | `string`                 | Yes      | Unique name for this source                    |
| `type`      | `"graphql"`              | Yes      | Source type                                    |
| `schema`    | `object`                 | Yes      | Schema configuration (see below)               |
| `documents` | `string \| string[]`     | Yes      | Glob pattern(s) for `.graphql` operation files |
| `scalars`   | `Record<string, string>` | No       | Custom scalar type mappings                    |
| `generates` | `array \| object`        | Yes      | What to generate (see above)                   |

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
| `generates` | `array \| object`        | Yes      | What to generate (see above)             |

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
    ├── query/             # TanStack Query output
    │   ├── types.ts       # TypeScript types (GraphQL only)
    │   └── operations.ts  # queryOptions and mutationOptions
    ├── start/             # TanStack Start output (when using start generator)
    │   └── functions.ts   # createServerFn wrappers
    └── form/              # TanStack Form output
        └── forms.ts       # formOptions
```

**Note:** The `client.ts` and `schema.ts` files are at the source root, shared by all generators. Server functions are in a separate `start/` directory and are imported by `query/operations.ts` when `serverFunctions: true`.

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

## TanStack Start Integration

tangrams can generate server functions for TanStack Start, wrapping your query and mutation operations in `createServerFn` for server-side data fetching.

### Configuration

Add `"start"` to your `generates` array to generate server functions in a separate directory:

```typescript
import { defineConfig } from "tangrams";

export default defineConfig({
  sources: [
    {
      name: "graphql",
      type: "graphql",
      schema: { url: "http://localhost:4000/graphql" },
      documents: "./src/graphql/**/*.graphql",
      generates: ["query", "start"], // Generate both query options and server functions
    },
  ],
});
```

To have your query options use the server functions, enable `serverFunctions: true`:

```typescript
generates: {
  query: { serverFunctions: true },
  start: true,
}
```

### Peer Dependencies

For server functions, you'll need TanStack Start:

```bash
bun add @tanstack/react-router @tanstack/react-start
```

### Generated Output

When using the `start` generator, tangrams creates server functions in a separate directory:

```
src/generated/
└── graphql/
    ├── client.ts
    ├── query/
    │   ├── types.ts
    │   └── operations.ts     # imports from ../start/functions when serverFunctions: true
    └── start/
        └── functions.ts      # createServerFn wrappers
```

#### `<source>/start/functions.ts`

Server functions for all operations:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { getClient } from "../client";

// Server function for queries (GET method)
export const getUserFn = createServerFn({ method: "GET" })
  .inputValidator((data: GetUserQueryVariables) => data)
  .handler(async ({ data }) =>
    (await getClient()).request<GetUserQuery>(GetUserDocument, data)
  );

// Server function for mutations (POST method)
export const createUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: CreateUserMutationVariables) => data)
  .handler(async ({ data }) =>
    (await getClient()).request<CreateUserMutation>(CreateUserDocument, data)
  );
```

#### `<source>/query/operations.ts` (with `serverFunctions: true`)

Query options that import and use the server functions:

```typescript
import { getUserFn, createUserFn } from "../start/functions";

export const getUserQueryOptions = (variables: GetUserQueryVariables) =>
  queryOptions({
    queryKey: ["graphql", "GetUser", variables],
    queryFn: () => getUserFn({ data: variables }),
  });

export const createUserMutationOptions = () =>
  mutationOptions({
    mutationKey: ["graphql", "CreateUser"],
    mutationFn: (variables: CreateUserMutationVariables) =>
      createUserFn({ data: variables }),
  });
```

### Usage

Use the generated options exactly as before - the server function wrapping is transparent:

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getUserQueryOptions,
  createUserMutationOptions,
} from "./generated/graphql/query/operations";

function UserProfile({ userId }: { userId: string }) {
  // Data fetching happens on the server!
  const { data } = useQuery(getUserQueryOptions({ id: userId }));
  return <div>{data?.user?.name}</div>;
}
```

You can also call server functions directly:

```typescript
import { getUserFn } from "./generated/graphql/start/functions";

// Call directly in loaders, actions, or other server contexts
const user = await getUserFn({ data: { id: "123" } });
```

## Roadmap

- TanStack DB integration
- TanStack Pacer integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © hobbescodes
