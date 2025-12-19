# Tangrams Examples

This directory contains example applications showcasing different tangrams configurations with TanStack Start.

## Overview

All examples are TanStack Start applications that demonstrate various combinations of:

- **Adapters**: GraphQL, OpenAPI
- **Generators**: `query` (TanStack Query), `form` (TanStack Form), `db` (TanStack DB)
- **Modes**: SSR (default) or SPA (for TanStack DB examples)

## Examples

| Example               | Adapter | Generators                | Mode | Description                            |
| --------------------- | ------- | ------------------------- | ---- | -------------------------------------- |
| `start-graphql-query` | GraphQL | `["query"]`               | SSR  | Basic GraphQL with TanStack Query      |
| `start-graphql-form`  | GraphQL | `["query", "form"]`       | SSR  | GraphQL + TanStack Form validation     |
| `start-openapi-query` | OpenAPI | `["query"]`               | SSR  | Basic OpenAPI/REST with TanStack Query |
| `start-openapi-form`  | OpenAPI | `["query", "form"]`       | SSR  | OpenAPI + TanStack Form validation     |
| `start-openapi-db`    | OpenAPI | `["db"]`                  | SPA  | Local-first with full sync             |
| `start-graphql-db`    | OpenAPI | `["db"]`                  | SPA  | Local-first with full sync             |
| `start-multi-source`  | Both    | `["query", "form"]`       | SSR  | Multiple data sources in one app       |
| `start-full-stack`    | OpenAPI | `["query", "form", "db"]` | SPA  | All generators combined                |

## Running Examples

### Prerequisites

- [Bun](https://bun.sh) installed
- Run `bun install` from the monorepo root

### Running a Single Example

From the monorepo root:

```bash
# Run the example
bun --filter <example-name> dev

# For example:
bun --filter start-graphql-query dev
```

Or from within the example directory:

```bash
cd examples/start-graphql-query
bun dev
```

### Generating Types

Each example has its own `tangrams.config.ts`. To generate types:

```bash
# From example directory
bun generate

# Or with watch mode
bun generate:watch
```

## Shared Infrastructure

### Mock API (`examples/shared/`)

All examples use [MSW (Mock Service Worker)](https://mswjs.io/) for API mocking. The shared mocks provide:

- **Mock Data**: Pets, Users (Petstore-style domain)
- **OpenAPI Spec**: REST endpoints for OpenAPI examples
- **GraphQL Schema**: Schema for GraphQL examples (including Hasura-style filtering)
- **MSW Handlers**: Request handlers for both REST and GraphQL

This allows examples to run completely standalone without requiring a real backend.

## Tech Stack

All examples use:

- **TanStack Start** - Full-stack React framework (Vite plugin)
- **TanStack Router** - Type-safe routing
- **Tailwind CSS v4** - Styling (Vite plugin)
- **MSW v2** - API mocking
- **Bun** - Package manager and runtime

## Contributing

When adding a new example:

1. Create a new directory under `examples/`
2. Follow the existing example structure
3. Use the shared mocks from `examples/shared/`
4. Update this README with the new example
5. Ensure `bun dev` and `bun generate` work correctly
