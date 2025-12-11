---
"tangen": minor
---

Add watch mode to the generate command. Use `--watch` or `-w` flag to automatically regenerate when config or GraphQL document files change. Features include:

- Watches config file and all GraphQL documents matching the configured patterns
- Caches the schema between document changes for faster rebuilds
- Debounces rapid file changes to avoid redundant regenerations
- Press `r` to force refresh (re-introspects schema)
- Press `q` to quit watch mode
- Continues watching even if generation fails (e.g., invalid GraphQL syntax)
