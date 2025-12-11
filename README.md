# tangen

> Code generation for the TanStack ecosystem

[![npm version](https://img.shields.io/npm/v/tangen.svg)](https://www.npmjs.com/package/tangen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

tangen is a comprehensive code generation tool for the TanStack ecosystem. It takes your schema and generates fully typed, ready-to-use artifacts for TanStack libraries.

Currently supporting **TanStack Query** with more integrations on the way.

## Features

- **TanStack Query** - Generate type-safe `queryOptions` and `mutationOptions` from your GraphQL operations
- **TanStack Form** - Generate type-safe form hooks and validation from your schema's input types _(coming soon)_
- **TanStack DB** - Generate collection definitions from your schema _(coming soon)_
- **TanStack Pacer** - Generate rate-limited operation wrappers _(coming soon)_

## Supported Data Sources

- **GraphQL** - Via introspection
- More coming soon

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

```bash
bun add @tanstack/react-query graphql-request
```

## Quick Start

1. **Initialize configuration**

   ```bash
   bunx tangen init
   ```

   This creates a `tangen.config.ts` file in your project root.

2. **Configure your schema endpoint**

   Edit `tangen.config.ts` with your GraphQL endpoint:

   ```typescript
   import { defineConfig } from "tangen";

   export default defineConfig({
     schema: {
       url: "http://localhost:4000/graphql",
     },
     documents: "./src/graphql/**/*.graphql",
     output: {
       dir: "./src/generated",
     },
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
   } from "./generated/operations";

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

## Configuration

### Full Configuration Example

```typescript
import { defineConfig } from "tangen";

export default defineConfig({
  // Schema introspection settings
  schema: {
    url: "http://localhost:4000/graphql",
    // Optional: headers for introspection request
    headers: {
      "x-api-key": process.env.API_KEY,
    },
  },
  // Optional: headers to include in generated client
  client: {
    headers: {
      "Content-Type": "application/json",
    },
  },
  // Optional: custom scalar type mappings
  scalars: {
    DateTime: "Date",
    JSON: "Record<string, unknown>",
  },
  // Glob pattern(s) for GraphQL operation files
  documents: "./src/graphql/**/*.graphql",
  // Output configuration
  output: {
    dir: "./src/generated",
    client: "client.ts", // default
    types: "types.ts", // default
    operations: "operations.ts", // default
  },
});
```

### Configuration Options

| Option              | Type                     | Required | Description                                    |
| ------------------- | ------------------------ | -------- | ---------------------------------------------- |
| `schema.url`        | `string`                 | Yes      | GraphQL endpoint URL for introspection         |
| `schema.headers`    | `Record<string, string>` | No       | Headers to send with introspection request     |
| `client.headers`    | `Record<string, string>` | No       | Headers to include in generated client         |
| `scalars`           | `Record<string, string>` | No       | Custom scalar type mappings                    |
| `documents`         | `string \| string[]`     | Yes      | Glob pattern(s) for `.graphql` files           |
| `output.dir`        | `string`                 | Yes      | Output directory for generated files           |
| `output.client`     | `string`                 | No       | Client filename (default: `client.ts`)         |
| `output.types`      | `string`                 | No       | Types filename (default: `types.ts`)           |
| `output.operations` | `string`                 | No       | Operations filename (default: `operations.ts`) |

### Default Scalar Mappings

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

### `client.ts`

A configured `graphql-request` client with helpers:

```typescript
import { GraphQLClient } from "graphql-request";

export const client = new GraphQLClient("http://localhost:4000/graphql", {
  headers: {
    /* your configured headers */
  },
});

// Update headers at runtime (e.g., for auth tokens)
export const setClientHeaders = (headers: HeadersInit) => {
  client.setHeaders(headers);
};

// Create a new client instance with custom headers
export const getClient = (headers?: HeadersInit) => {
  return new GraphQLClient(endpoint, { headers });
};
```

### `types.ts`

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

### `operations.ts`

Ready-to-use `queryOptions` and mutation options:

```typescript
export const getUserQueryOptions = (variables: GetUserQueryVariables) =>
  queryOptions({
    queryKey: ["GetUser", variables],
    queryFn: () => client.request<GetUserQuery>(GetUserDocument, variables),
  });

export const createUserMutationOptions = () => ({
  mutationKey: ["CreateUser"],
  mutationFn: (variables: CreateUserMutationVariables) =>
    client.request<CreateUserMutation>(CreateUserDocument, variables),
});
```

## CLI Reference

### `tangen init`

Initialize a new `tangen.config.ts` file.

```bash
tangen init [options]

Options:
  -f, --force    Overwrite existing config file
```

### `tangen generate`

Generate TypeScript code from your GraphQL schema and operations.

```bash
tangen generate [options]

Options:
  -c, --config <path>    Path to config file
```

## Runtime Authentication

The generated client includes helpers for setting headers at runtime, which is useful for authentication:

```typescript
import { setClientHeaders } from "./generated/client";

// After user logs in
function onLogin(token: string) {
  setClientHeaders({
    Authorization: `Bearer ${token}`,
  });
}

// Or use getClient for one-off requests with different headers
import { getClient } from "./generated/client";

const authenticatedClient = getClient({
  Authorization: `Bearer ${token}`,
});
```

## Roadmap

- TanStack Form integration
- TanStack DB integration
- TanStack Pacer integration
- Additional data source support

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © hobbescodes
