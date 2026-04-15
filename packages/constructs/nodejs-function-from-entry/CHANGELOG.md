# @aligent/cdk-nodejs-function-from-entry

## 0.1.0

### Minor Changes

- [#1643](https://github.com/aligent/cdk-constructs/pull/1643) [`486c193`](https://github.com/aligent/cdk-constructs/commit/486c193ed38892dad71c3eb7d3abe8354e62fe19) Thanks [@kai-nguyen-aligent](https://github.com/kai-nguyen-aligent)! - Add `NodejsFunctionFromEntry` construct for type-safe Lambda function creation from entry files with automatic source-to-dist path resolution. Update `StepFunctionFromFile` to use a `baseDir`-relative filepath pattern with a typed prefix constraint, preventing file inclusion attacks.

### Patch Changes

- [#1649](https://github.com/aligent/cdk-constructs/pull/1649) [`cb58f6f`](https://github.com/aligent/cdk-constructs/commit/cb58f6fb5e3980f2244560d61b34382750e2ed92) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Align @types/node version with other packages to fix yarn lockfile immutability check in CI
