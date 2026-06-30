# @aligent/cdk-secure-rest-api

## 1.2.0

### Minor Changes

- [#1720](https://github.com/aligent/cdk-constructs/pull/1720) [`2649bf8`](https://github.com/aligent/cdk-constructs/commit/2649bf833e9b8bec9261918bd013b4b71f368fe5) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Support nested (multi-segment) route paths in the `routes` helper. Paths such as `rewards/accounts/{accountId}/redeem` now create the intermediate resources instead of throwing `ResourceSPathPartOnly` at synth time. Routes sharing a common prefix resolve idempotently.

  Add a `deployOptions` prop (CDK `StageOptions`) so the deployed stage name and other stage settings can be configured. Defaults to the CDK `prod` stage when omitted.

## 1.1.2

### Patch Changes

- [#1688](https://github.com/aligent/cdk-constructs/pull/1688) [`5fc3de2`](https://github.com/aligent/cdk-constructs/commit/5fc3de2da74962c1e11a57a375fb11c71406d5c8) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 10 updates

## 1.1.1

### Patch Changes

- [#1689](https://github.com/aligent/cdk-constructs/pull/1689) [`6f1930f`](https://github.com/aligent/cdk-constructs/commit/6f1930f8d8b6d646252217a4c7363458bd22f597) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Fix published artifact: declarations (`*.d.ts`) were missing from the tarball because the package had no `.npmignore`, so `npm pack` fell back to the workspace `.gitignore` (which excludes build outputs). Consumers with `isolatedModules: true` then resolved `index.ts` directly and hit `TS1205` on the type re-exports. This release adds the package's own `.npmignore` (matching sibling packages) and converts the type re-exports in `index.ts` to `export type`.

## 1.1.0

### Minor Changes

- [#1667](https://github.com/aligent/cdk-constructs/pull/1667) [`631a92c`](https://github.com/aligent/cdk-constructs/commit/631a92ce3b8846a97c757a2145a369f287ef4ad3) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Add new `SecureRestApi` construct for provisioning an API Gateway REST API secured with API key authentication and usage plan throttling. Supports configurable routes (accepting any CDK `Integration`), CORS options, and throttle limits.

### Patch Changes

- [#1669](https://github.com/aligent/cdk-constructs/pull/1669) [`8006ed3`](https://github.com/aligent/cdk-constructs/commit/8006ed327661e66d9e9b91b2d3ec205594ba4c06) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 9 updates
