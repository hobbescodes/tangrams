---
"tangrams": minor
---

Add Vite plugin for integrating tangrams into Vite dev server and build process

**New Features:**
- New `tangrams/vite` export with Vite plugin
- Automatic code generation on dev server start and build
- Automatic file watching and regeneration in dev mode
- Full page reload on regeneration to pick up changes
- Cleanup of stale directories enabled by default

**Plugin Options:**
- `configFile` - Path to config file (auto-discovers tangrams.config.ts by default)
- `force` - Force regenerate all files
- `watch` - Watch for file changes in dev mode (default: true)
- `clean` - Automatically remove stale directories (default: true)

**Breaking Changes:**
- None - this is a purely additive feature

**Internal Changes:**
- Logger abstraction for clean integration with Vite's logging system
- Generator now accepts optional logger parameter for programmatic usage
- Additional type exports from main entry point
