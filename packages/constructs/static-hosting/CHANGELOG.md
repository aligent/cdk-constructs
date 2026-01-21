# @aligent/cdk-static-hosting

## 2.11.0

### Minor Changes

- [#1568](https://github.com/aligent/cdk-constructs/pull/1568) [`e996387`](https://github.com/aligent/cdk-constructs/commit/e99638765813f1c62fc89e9f67f32e379177e302) Thanks [@porhkz](https://github.com/porhkz)! - Added optional CORS Response Header Policy and added NoIndexNoFollow Response Header Policy

## 2.10.0

### Minor Changes

- [#1561](https://github.com/aligent/cdk-constructs/pull/1561) [`12d43ec`](https://github.com/aligent/cdk-constructs/commit/12d43ec05b299debaf4b13c56cc85966f4c53777) Thanks [@aaronmedina-dev](https://github.com/aaronmedina-dev)! - Adds cloudFrontLogRetentionDays prop to enable automatic deletion of CloudFront access logs after a specified number of days using S3 lifecycle rules. Logs are retained indefinitely by default for backward compatibility.

## 2.9.3

### Patch Changes

- [#1536](https://github.com/aligent/cdk-constructs/pull/1536) [`ad08ac2`](https://github.com/aligent/cdk-constructs/commit/ad08ac23e76a2946d7103c8779b9bfad44a2982f) Thanks [@porhkz](https://github.com/porhkz)! - Fixed undefined error for Static Hosting additionalBehavior paths

## 2.9.2

### Patch Changes

- [#1523](https://github.com/aligent/cdk-constructs/pull/1523) [`2550ceb`](https://github.com/aligent/cdk-constructs/commit/2550cebd411cf2cfd5b92deba17e18a5a3d3d012) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Fixes changeset publishing to work correctly by switching from dist-based builds to in-place compilation within packages

## 2.9.1

### Patch Changes

- [#1518](https://github.com/aligent/cdk-constructs/pull/1518) [`590e172`](https://github.com/aligent/cdk-constructs/commit/590e172101c7e4fa496333b18444430e1494fd3c) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Fix CSP Lambda error handling when fallback is provided

## 2.9.0

### Minor Changes

- [#1512](https://github.com/aligent/cdk-constructs/pull/1512) [`a9a6231`](https://github.com/aligent/cdk-constructs/commit/a9a62319e4528ac2d23f3af96e96cb2427f242f8) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Adds changeset package to handle release management
