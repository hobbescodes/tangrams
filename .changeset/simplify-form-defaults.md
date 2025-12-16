---
"tangrams": minor
---

TanStack Form generation improvements:

**Simplified default values:**
- Use empty object with type assertion (`{} as TypeName`) for `defaultValues` instead of generating default values from Zod schemas
- Remove complex default value extraction and generation logic
- Simplify both OpenAPI and GraphQL form generation adapters
- Remove `defaults.ts` and related code (no longer needed)

**Configurable form validators:**
- Add `overrides.form.validator` option to configure which validator timing to use
- Supported validators: `onChange`, `onChangeAsync`, `onBlur`, `onBlurAsync`, `onSubmit`, `onSubmitAsync` (default), `onDynamic`
- Add `overrides.form.validationLogic` option for `onDynamic` validator with `mode` and `modeAfterSubmission` settings
- Default `validationLogic` is `{ mode: "submit", modeAfterSubmission: "change" }` matching TanStack Form's common revalidation pattern

Example configuration:
```typescript
// tangrams.config.ts
export default defineConfig({
  sources: [
    {
      name: "api",
      type: "openapi",
      spec: "./openapi.yaml",
      generates: ["form"],
      overrides: {
        form: {
          validator: "onDynamic",
          validationLogic: {
            mode: "submit",
            modeAfterSubmission: "change",
          },
        },
      },
    },
  ],
})
```
