---
"tangrams": patch
---

Fix inconsistent relative import paths in generated output. Previously, some imports were generated as `./../schema` instead of `../schema`. This change introduces a `getRelativeImportPath` utility that properly normalizes all relative import paths, and makes all import path calculations dynamic (removing hardcoded `FUNCTIONS_IMPORT_PATH` constants) for consistency and future flexibility.
