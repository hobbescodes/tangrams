---
"tangen": minor
---

Upgrade to Zod v4. Generated OpenAPI types now use Zod v4 top-level validators (e.g., `z.email()` instead of `z.string().email()`, `z.iso.datetime()` instead of `z.string().datetime()`). The peer dependency has been updated to require Zod >=4.0.0.

**Breaking Changes:**
- Zod peer dependency now requires v4.0.0 or higher
- Generated OpenAPI type imports changed from `import { z } from "zod"` to `import * as z from "zod"`
- String format validators use new top-level APIs: `z.email()`, `z.url()`, `z.uuid()`, `z.ipv4()`, `z.ipv6()`, `z.iso.datetime()`, `z.iso.date()`, `z.iso.time()`
