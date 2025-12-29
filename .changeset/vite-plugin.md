---
"tangrams": minor
---

Add Vite plugin for configuring tangrams directly in vite.config.ts

**New Features:**
- New `tangrams/vite` export with Vite plugin
- Configure tangrams inline in your Vite config or load from external config file
- Automatic file watching and regeneration in dev mode
- Full page reload on regeneration to pick up changes
- Cleanup of stale directories enabled by default

**Breaking Changes:**
- None - this is a purely additive feature

**Internal Changes:**
- Logger abstraction for clean integration with Vite's logging system
- Generator now accepts optional logger parameter for programmatic usage
- Additional type exports from main entry point
