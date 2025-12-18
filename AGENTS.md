# AGENTS.md

## Monorepo Structure

This is a Bun workspaces monorepo with the following structure:

- `packages/cli/` - The `tangrams` CLI package (published to npm)
- `apps/docs/` - Documentation site (TanStack Start + Fumadocs)

## Commands

### Root Commands (run from repo root)
- **Install**: `bun install`
- **Build CLI**: `bun run build`
- **Lint**: `bun run lint` (fix: `bun run lint:fix`)
- **Format**: `bun run format`
- **Typecheck all**: `bun run typecheck`
- **Test CLI**: `bun run test`
- **Dev CLI**: `bun run dev:cli`
- **Dev Docs**: `bun run dev:docs`

### CLI Package Commands (run from `packages/cli/`)
- **Test single**: `bun run test <file>` (e.g., `bun run test src/core/generator.test.ts`)
- **Update snapshots**: `bun run test -u`

## Code Style (Biome)
- Tabs for indentation, double quotes, no semicolons (except when required)
- Imports are auto-organized; use `@/*` alias for `./src/*` (CLI package)
- Use `type` imports for type-only imports (`import type { X } from "y"`)

## Naming Conventions
- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `camelCase` (not SCREAMING_CASE)

## Error Handling
- Use Zod for config/input validation with descriptive error messages
- Throw `Error` with clear, actionable messages

## Bun-First
- Use Bun runtime, not Node.js. See CLAUDE.md for Bun-specific APIs.

## Changesets
- Add a changeset for any user-facing CLI changes (new features, breaking changes, bug fixes)
- Run `bunx changeset` or create a markdown file in `.changeset/` with the format:
  ```md
  ---
  "tangrams": patch | minor
  ---
  Description of the change.
  ```
- Use `patch` for bug fixes, `minor` for new features or breaking changes
- **Never use `major`** - major version bumps are always done manually
- The docs app is ignored by changesets (private package)

## Documentation
- Always verify and update documentation (README.md, docs site) after making breaking changes or changes that affect user-facing APIs, config structure, or CLI behavior
- Docs content lives in `apps/docs/content/docs/`

## TanStack Start Server Functions
- Use `.inputValidator()` not `.validator()` when generating server functions with `createServerFn`
- Always verify against current TanStack Start documentation when making changes to server function generation

## Type Safety
- **Never use `as any`** - If there is a complex type mismatch issue, analyze the root cause and bring it to the user's attention for discussion rather than masking it with type assertions
- Prefer proper type mappings, generics, or schema adjustments over unsafe casts
- If type issues arise in generated code, the generator logic should be fixed to produce correctly typed output
