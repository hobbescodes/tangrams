# tangrams

> Code generation for the TanStack ecosystem

[![npm version](https://img.shields.io/npm/v/tangrams.svg)](https://www.npmjs.com/package/tangrams)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pkg.pr.new](https://pkg.pr.new/badge/hobbescodes/tangrams)](https://pkg.pr.new/~/hobbescodes/tangrams)

> [!WARNING]
> This project is in **alpha** and under active development. APIs may change without notice.

## Overview

tangrams is a comprehensive code generation tool for the TanStack ecosystem. It takes your GraphQL or OpenAPI schema and generates fully typed, ready-to-use artifacts for TanStack libraries.

## Features

- **TanStack Query** - Generate type-safe `queryOptions`, `infiniteQueryOptions`, and `mutationOptions`
- **TanStack Form** - Generate type-safe `formOptions` with validation schemas
- **TanStack DB** - Generate `queryCollectionOptions` with auto-detected CRUD operations

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

```bash
# TanStack Query (generates includes "query")
bun add @tanstack/react-query

# TanStack Form (generates includes "form")
bun add @tanstack/react-form

# TanStack DB (generates includes "db")
bun add @tanstack/react-db @tanstack/query-db-collection @tanstack/react-query

# Validation library (choose one - zod is the default)
bun add zod        # Default validator
# bun add valibot  # Lightweight alternative
# bun add arktype  # Type-first validation
# bun add effect   # Effect ecosystem

# GraphQL sources
bun add graphql-request

# OpenAPI sources
bun add @better-fetch/fetch
```

## Quick Start

1. **Initialize configuration**

   ```bash
   bunx tangrams init
   ```

2. **Configure your source** in `tangrams.config.ts`:

   ```typescript
   import { defineConfig } from "tangrams";

   export default defineConfig({
     sources: [
       {
         name: "api",
         type: "graphql",
         schema: { url: "http://localhost:4000/graphql" },
         documents: "./src/graphql/**/*.graphql",
         generates: ["query", "form"],
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
   import { useQuery, useMutation } from "@tanstack/react-query"
   import { getUserQueryOptions, createUserMutationOptions } from "./tangrams/api/query/operations"

   function UserProfile({ userId }: { userId: string }) {
     const { data } = useQuery(getUserQueryOptions({ id: userId }))
     const { mutate } = useMutation(createUserMutationOptions())

     return <div>{data?.user?.name}</div>
   }
   ```

## Documentation

For comprehensive documentation, configuration reference, and usage examples, visit the **[Tangrams Documentation](https://tangrams.dev/docs)**.

- **[Getting Started](https://tangrams.dev/docs)** - Installation, configuration reference, and all available options
- **[TanStack Query](https://tangrams.dev/docs/tanstack-query)** - Generate `queryOptions`, `infiniteQueryOptions` when applicable, and `mutationOptions`
- **[TanStack Form](https://tangrams.dev/docs/tanstack-form)** - Generate `formOptions` with schema validation
- **[TanStack DB](https://tangrams.dev/docs/tanstack-db)** - Generate collections with local-first data sync

## CLI Reference

### `tangrams init`

Initialize a new `tangrams.config.ts` file.

```bash
tangrams init [options]

Options:
  -f, --force    Overwrite existing config file
```

### `tangrams generate`

Generate TypeScript code from your configured sources.

```bash
tangrams generate [options]

Options:
  -c, --config <path>    Path to config file
  -f, --force            Force regeneration of all files including client
  -w, --watch            Watch for file changes and regenerate
  --clean                Remove stale source directories from previous generations
  -y, --yes              Skip confirmation prompts (use with --clean)
  --env-file <path>      Path to env file (can be specified multiple times)
  --no-dotenv            Disable automatic .env file loading
```

#### Cleanup Mode

When using `--clean`, tangrams will detect and remove stale source directories from previous generations. This is useful when you rename or remove sources from your configuration.

```bash
# Remove stale artifacts (prompts for confirmation)
tangrams generate --clean

# Remove stale artifacts without prompting
tangrams generate --clean --yes
```

If tangrams detects that a source was renamed (same schema/spec, different name), it will automatically copy the `client.ts` file to the new source directory before removing the old one. This preserves any customizations you've made to the client.

#### Watch Mode

When using `--watch`, tangrams will:

- Watch your config file, GraphQL documents, and OpenAPI specs for changes
- Cache schemas between file changes for faster rebuilds
- Continue watching even if generation fails

Interactive commands in watch mode:

- Press `r` to force a full refresh (re-fetches all schemas)
- Press `q` to quit

## Roadmap

- Multi-Framework Code Generation
- TanStack DB - Electic Collections
- TanStack DB - LocalStorage Collections
- TBD

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © hobbescodes
