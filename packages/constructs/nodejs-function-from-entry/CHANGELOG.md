# @aligent/cdk-nodejs-function-from-entry

## 0.2.2

### Patch Changes

- [#1669](https://github.com/aligent/cdk-constructs/pull/1669) [`8006ed3`](https://github.com/aligent/cdk-constructs/commit/8006ed327661e66d9e9b91b2d3ec205594ba4c06) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 9 updates

## 0.2.1

### Patch Changes

- [#1639](https://github.com/aligent/cdk-constructs/pull/1639) [`060f291`](https://github.com/aligent/cdk-constructs/commit/060f29103f3fd2146bd2d88de54d0e2009f55910) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): bump ts-jest from 29.4.6 to 29.4.9 in the testing-tools group across 1 directory

- [#1642](https://github.com/aligent/cdk-constructs/pull/1642) [`d760efe`](https://github.com/aligent/cdk-constructs/commit/d760efe3baec8e33df1b49415de815e2bfd128e5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 11 updates

- [#1658](https://github.com/aligent/cdk-constructs/pull/1658) [`9da935e`](https://github.com/aligent/cdk-constructs/commit/9da935eaf79dd4fa6a07fc1d183fbe04c5c74501) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates

## 0.2.0

### Minor Changes

- [#1654](https://github.com/aligent/cdk-constructs/pull/1654) [`99d96c9`](https://github.com/aligent/cdk-constructs/commit/99d96c95b237b9b1d9e341957d621025e0c3bd6a) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - ### `@aligent/cdk-nodejs-function-from-entry` (minor)
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

## 0.1.0

### Minor Changes

- [#1643](https://github.com/aligent/cdk-constructs/pull/1643) [`486c193`](https://github.com/aligent/cdk-constructs/commit/486c193ed38892dad71c3eb7d3abe8354e62fe19) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Add `NodejsFunctionFromEntry` construct for type-safe Lambda function creation from entry files with automatic source-to-dist path resolution. Update `StepFunctionFromFile` to use a `baseDir`-relative filepath pattern with a typed prefix constraint, preventing file inclusion attacks.

### Patch Changes

- [#1649](https://github.com/aligent/cdk-constructs/pull/1649) [`cb58f6f`](https://github.com/aligent/cdk-constructs/commit/cb58f6fb5e3980f2244560d61b34382750e2ed92) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Align @types/node version with other packages to fix yarn lockfile immutability check in CI
