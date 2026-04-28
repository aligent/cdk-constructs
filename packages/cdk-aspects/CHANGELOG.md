# @aligent/cdk-aspects

## 0.5.5

### Patch Changes

- [#1639](https://github.com/aligent/cdk-constructs/pull/1639) [`060f291`](https://github.com/aligent/cdk-constructs/commit/060f29103f3fd2146bd2d88de54d0e2009f55910) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): bump ts-jest from 29.4.6 to 29.4.9 in the testing-tools group across 1 directory

- [#1642](https://github.com/aligent/cdk-constructs/pull/1642) [`d760efe`](https://github.com/aligent/cdk-constructs/commit/d760efe3baec8e33df1b49415de815e2bfd128e5) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 11 updates

- [#1658](https://github.com/aligent/cdk-constructs/pull/1658) [`9da935e`](https://github.com/aligent/cdk-constructs/commit/9da935eaf79dd4fa6a07fc1d183fbe04c5c74501) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates

## 0.5.4

### Patch Changes

- [#1660](https://github.com/aligent/cdk-constructs/pull/1660) [`d2fb7aa`](https://github.com/aligent/cdk-constructs/commit/d2fb7aa1c03fcf4257d8f5883bf5765510885486) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Fixed `StepFunctionsDefaultsAspect` missing IAM grants for CloudWatch Logs delivery. The aspect was setting `loggingConfiguration` directly on the L1 `CfnStateMachine`, bypassing CDK's IAM grant mechanism. The state machine role now receives the required `logs:*` permissions, preventing the `"IAM Role is not authorized to access the Log Destination"` CloudFormation error on deployment.

## 0.5.3

### Patch Changes

- [#1661](https://github.com/aligent/cdk-constructs/pull/1661) [`25cf7c9`](https://github.com/aligent/cdk-constructs/commit/25cf7c9fc6427a9c5a15f01928ee2121c03a3ec7) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Fixed `ResourcePrefixAspect` failing synthesis when a prefixed resource name exceeds the AWS maximum length. The aspect now truncates the name and appends an 8-character SHA-256 hash to maintain uniqueness, and emits a `cdk synth` warning identifying the original and truncated name. This prevents L3 constructs (e.g. `BucketDeployment`) from generating child resources that the user has no control over causing failed deployments.

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

## 0.5.2

### Patch Changes

- [#1609](https://github.com/aligent/cdk-constructs/pull/1609) [`ba5bc76`](https://github.com/aligent/cdk-constructs/commit/ba5bc7641349972a11dd8f0f993e236bb270c468) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump esbuild from 0.25.0 to 0.27.3 in the esbuild group across 1 directory

## 0.5.1

### Patch Changes

- [#1622](https://github.com/aligent/cdk-constructs/pull/1622) [`57b9148`](https://github.com/aligent/cdk-constructs/commit/57b9148b8ed80bcc40ee5c7461b353289b87f659) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps-dev): bump the dev-tools group across 1 directory with 4 updates

- [#1633](https://github.com/aligent/cdk-constructs/pull/1633) [`9276087`](https://github.com/aligent/cdk-constructs/commit/927608749f1ac2340e0e2f758ba3ccf02e54d405) Thanks [@aikido-autofix](https://github.com/apps/aikido-autofix)! - [Aikido] Fix 5 security issues in yaml, minimatch, ajv

- [#1634](https://github.com/aligent/cdk-constructs/pull/1634) [`38d563f`](https://github.com/aligent/cdk-constructs/commit/38d563f2b5d67401b1234736f11cee446e5ae7d7) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the npm_and_yarn group across 1 directory with 2 updates

- [#1636](https://github.com/aligent/cdk-constructs/pull/1636) [`6805acb`](https://github.com/aligent/cdk-constructs/commit/6805acbb180625de5a494fd2fe11827520a77b76) Thanks [@aikido-autofix](https://github.com/apps/aikido-autofix)! - [Aikido] Fix security issue in aws-cdk-lib via minor version upgrade from 2.235.1 to 2.245.0

- [#1638](https://github.com/aligent/cdk-constructs/pull/1638) [`7a8d347`](https://github.com/aligent/cdk-constructs/commit/7a8d3470b97fbdc769f18d55ce1c1a35b96cdf18) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Update constructs peer dependency from ^10.3.0/^10.4.2 to ^10.5.0 to match aws-cdk-lib@2.245.0 requirements

## 0.5.0

### Minor Changes

- [#1630](https://github.com/aligent/cdk-constructs/pull/1630) [`91347d6`](https://github.com/aligent/cdk-constructs/commit/91347d62e048c23ae85f657e97c1dd357c1b2a70) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Add default aspects for S3 and DynamoDB resources to enforce secure configuration defaults

## 0.4.0

### Minor Changes

- [#1627](https://github.com/aligent/cdk-constructs/pull/1627) [`a53bad0`](https://github.com/aligent/cdk-constructs/commit/a53bad0c3b8156ec3b57476b4007cdb854785ba6) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Add new ResourcePrefixAspect

## 0.3.2

### Patch Changes

- [#1606](https://github.com/aligent/cdk-constructs/pull/1606) [`0e35d91`](https://github.com/aligent/cdk-constructs/commit/0e35d91ab5244d90625ebe19d943694af875a422) Thanks [@porhkz](https://github.com/porhkz)! - Update repository URLs in package.json to match npm provenance expectations

## 0.3.1

### Patch Changes

- [#1601](https://github.com/aligent/cdk-constructs/pull/1601) [`1488e90`](https://github.com/aligent/cdk-constructs/commit/1488e90d7f468f7646142a9968a3d4e06389b358) Thanks [@porhkz](https://github.com/porhkz)! - Fix badges on readmes

## 0.3.0

### Minor Changes

- [#1582](https://github.com/aligent/cdk-constructs/pull/1582) [`e069f79`](https://github.com/aligent/cdk-constructs/commit/e069f794bdbb003510ffb769504bc776839c7500) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Migrate new Microservices default aspects (log-group, nodejs-function, and step-functions); Re-organies aspects depends on their functionality.

## 0.2.0

### Minor Changes

- [#1573](https://github.com/aligent/cdk-constructs/pull/1573) [`9c26514`](https://github.com/aligent/cdk-constructs/commit/9c26514be321e73b4217aa4a040ac4a91f9b1503) Thanks [@ryanrixxh](https://github.com/ryanrixxh)! - Restucture of the internal codebase and addition of CDK Aspects package. The Aspects package exports a number of usable cdk aspects
