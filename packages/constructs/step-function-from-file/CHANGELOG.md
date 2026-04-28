# @aligent/cdk-step-function-from-file

## 0.5.1

### Patch Changes

- [#1639](https://github.com/aligent/cdk-constructs/pull/1639) [`060f291`](https://github.com/aligent/cdk-constructs/commit/060f29103f3fd2146bd2d88de54d0e2009f55910) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): bump ts-jest from 29.4.6 to 29.4.9 in the testing-tools group across 1 directory

- [#1642](https://github.com/aligent/cdk-constructs/pull/1642) [`d760efe`](https://github.com/aligent/cdk-constructs/commit/d760efe3baec8e33df1b49415de815e2bfd128e5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 11 updates

- [#1658](https://github.com/aligent/cdk-constructs/pull/1658) [`9da935e`](https://github.com/aligent/cdk-constructs/commit/9da935eaf79dd4fa6a07fc1d183fbe04c5c74501) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates

## 0.5.0

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

## 0.4.0

### Minor Changes

- [#1643](https://github.com/aligent/cdk-constructs/pull/1643) [`486c193`](https://github.com/aligent/cdk-constructs/commit/486c193ed38892dad71c3eb7d3abe8354e62fe19) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Add `NodejsFunctionFromEntry` construct for type-safe Lambda function creation from entry files with automatic source-to-dist path resolution. Update `StepFunctionFromFile` to use a `baseDir`-relative filepath pattern with a typed prefix constraint, preventing file inclusion attacks.

## 0.3.6

### Patch Changes

- [#1622](https://github.com/aligent/cdk-constructs/pull/1622) [`57b9148`](https://github.com/aligent/cdk-constructs/commit/57b9148b8ed80bcc40ee5c7461b353289b87f659) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): bump the dev-tools group across 1 directory with 4 updates

- [#1633](https://github.com/aligent/cdk-constructs/pull/1633) [`9276087`](https://github.com/aligent/cdk-constructs/commit/927608749f1ac2340e0e2f758ba3ccf02e54d405) Thanks [@aikido-autofix](https://github.com/apps/aikido-autofix)! - [Aikido] Fix 5 security issues in yaml, minimatch, ajv

- [#1634](https://github.com/aligent/cdk-constructs/pull/1634) [`38d563f`](https://github.com/aligent/cdk-constructs/commit/38d563f2b5d67401b1234736f11cee446e5ae7d7) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates

- [#1636](https://github.com/aligent/cdk-constructs/pull/1636) [`6805acb`](https://github.com/aligent/cdk-constructs/commit/6805acbb180625de5a494fd2fe11827520a77b76) Thanks [@aikido-autofix](https://github.com/apps/aikido-autofix)! - [Aikido] Fix security issue in aws-cdk-lib via minor version upgrade from 2.235.1 to 2.245.0

- [#1638](https://github.com/aligent/cdk-constructs/pull/1638) [`7a8d347`](https://github.com/aligent/cdk-constructs/commit/7a8d3470b97fbdc769f18d55ce1c1a35b96cdf18) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Update constructs peer dependency from ^10.3.0/^10.4.2 to ^10.5.0 to match aws-cdk-lib@2.245.0 requirements

## 0.3.5

### Patch Changes

- [#1606](https://github.com/aligent/cdk-constructs/pull/1606) [`0e35d91`](https://github.com/aligent/cdk-constructs/commit/0e35d91ab5244d90625ebe19d943694af875a422) Thanks [@porhkz](https://github.com/porhkz)! - Update repository URLs in package.json to match npm provenance expectations

## 0.3.4

### Patch Changes

- [#1601](https://github.com/aligent/cdk-constructs/pull/1601) [`1488e90`](https://github.com/aligent/cdk-constructs/commit/1488e90d7f468f7646142a9968a3d4e06389b358) Thanks [@porhkz](https://github.com/porhkz)! - Fix badges on readmes

## 0.3.3

### Patch Changes

- [#1573](https://github.com/aligent/cdk-constructs/pull/1573) [`9c26514`](https://github.com/aligent/cdk-constructs/commit/9c26514be321e73b4217aa4a040ac4a91f9b1503) Thanks [@ryanrixxh](https://github.com/ryanrixxh)! - Restucture of the internal codebase and addition of CDK Aspects package. The Aspects package exports a number of usable cdk aspects

## 0.3.2

### Patch Changes

- [#1565](https://github.com/aligent/cdk-constructs/pull/1565) [`1acf1eb`](https://github.com/aligent/cdk-constructs/commit/1acf1eb88a76d94300feccd713aa620fd5543458) Thanks [@ryanrixxh](https://github.com/ryanrixxh)! - Migrating the step function from file from the MS node template to the cdk-constructs repo for use in MS projects
