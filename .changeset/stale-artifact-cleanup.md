---
"tangrams": minor
---

Add `--clean` flag to remove stale source directories when sources are renamed or removed from configuration.

**New CLI flags:**
- `--clean` - Detects and removes orphaned source directories from previous generations
- `--yes` / `-y` - Skips confirmation prompts (use with `--clean`)

**Features:**
- Automatically detects source renames by comparing configuration fingerprints (schema URL, spec path, document patterns)
- When a rename is detected, copies `client.ts` to the new source directory before removing the old one, preserving user customizations
- Prompts for confirmation before deleting directories (unless `--yes` is provided)
- In watch mode with `--clean`, cleanup runs automatically without prompts on config changes
- Generates a `.gitignore` in the `tangrams/` output directory to exclude the manifest file from version control

**Example usage:**
```bash
# Clean up stale artifacts with confirmation
tangrams generate --clean

# Clean up without prompting
tangrams generate --clean --yes

# Watch mode with automatic cleanup
tangrams generate --watch --clean
```
