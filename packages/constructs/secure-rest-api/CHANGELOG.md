# @aligent/cdk-secure-rest-api

## 1.1.1

### Patch Changes

- [#1689](https://github.com/aligent/cdk-constructs/pull/1689) [`6f1930f`](https://github.com/aligent/cdk-constructs/commit/6f1930f8d8b6d646252217a4c7363458bd22f597) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Fix published artifact: declarations (`*.d.ts`) were missing from the tarball because the package had no `.npmignore`, so `npm pack` fell back to the workspace `.gitignore` (which excludes build outputs). Consumers with `isolatedModules: true` then resolved `index.ts` directly and hit `TS1205` on the type re-exports. This release adds the package's own `.npmignore` (matching sibling packages) and converts the type re-exports in `index.ts` to `export type`.

## 1.1.0

### Minor Changes

- [#1667](https://github.com/aligent/cdk-constructs/pull/1667) [`631a92c`](https://github.com/aligent/cdk-constructs/commit/631a92ce3b8846a97c757a2145a369f287ef4ad3) Thanks [@toddhainsworth](https://github.com/toddhainsworth)! - Add new `SecureRestApi` construct for provisioning an API Gateway REST API secured with API key authentication and usage plan throttling. Supports configurable routes (accepting any CDK `Integration`), CORS options, and throttle limits.

### Patch Changes

- [#1669](https://github.com/aligent/cdk-constructs/pull/1669) [`8006ed3`](https://github.com/aligent/cdk-constructs/commit/8006ed327661e66d9e9b91b2d3ec205594ba4c06) Thanks [@dependabot](https://github.com/apps/dependabot)! - chore(deps): bump the aws group across 1 directory with 9 updates
