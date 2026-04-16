---
"@aligent/cdk-nodejs-function-from-entry": minor
"@aligent/cdk-step-function-from-file": minor
"@aligent/cdk-aspects": patch
---

### `@aligent/cdk-nodejs-function-from-entry` (minor)

- **Changed base class from `Function` to `NodejsFunction`** — the construct now extends `NodejsFunction` (and accepts `NodejsFunctionProps`) instead of the generic `Function`, enabling Node.js-specific bundling options. The parent `entry` prop is omitted to avoid conflicts with the custom typed `entry`.
- **Added `NoInfer` to the `entry` generic parameter** — prevents TypeScript from incorrectly inferring `TPrefix` from the `entry` value; the prefix is now inferred solely from `sourcePrefix`.
- **Made `runtime` optional** — consumers no longer need to explicitly pass a runtime.
- **Improved path traversal validation** — replaced the simple relative-path check with a `findServiceRoot` helper that walks up to a configurable `rootParentDir` ancestor, giving clearer error messages on invalid paths.
- **Added `rootParentDir` prop** (default: `'services'`) to control the allowed root for asset resolution.

### `@aligent/cdk-step-function-from-file` (minor)

- **Added `NoInfer` to the `filepath` generic parameter** — prevents unintended type inference from the `filepath` value.
- **Improved path traversal validation** — uses the same `findServiceRoot` approach as the Lambda construct for consistent, configurable path safety checks.
- **Added `rootParentDir` prop** (default: `'services'`) to control the allowed root for asset resolution.

### `@aligent/cdk-aspects` (patch)

- **Updated `NodeJsFunctionDefaultsAspect` JSDoc** — clarified that the configured runtime is always applied to ensure consistency, while other defaults (tracing, memory, timeout, source maps) are only applied when not already set.
