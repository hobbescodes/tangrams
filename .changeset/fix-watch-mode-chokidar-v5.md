---
"tangen": patch
---

Fix watch mode not detecting file changes with chokidar v5. Chokidar v4+ removed glob pattern support, so the watcher now extracts base directories from glob patterns and uses picomatch to filter file change events. This ensures that both existing file modifications and newly created files matching the document patterns trigger regeneration.
