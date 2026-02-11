# @aligent/cdk-waf

## 2.5.2

### Patch Changes

- [#1606](https://github.com/aligent/cdk-constructs/pull/1606) [`0e35d91`](https://github.com/aligent/cdk-constructs/commit/0e35d91ab5244d90625ebe19d943694af875a422) Thanks [@porhkz](https://github.com/porhkz)! - Update repository URLs in package.json to match npm provenance expectations

## 2.5.1

### Patch Changes

- [#1601](https://github.com/aligent/cdk-constructs/pull/1601) [`1488e90`](https://github.com/aligent/cdk-constructs/commit/1488e90d7f468f7646142a9968a3d4e06389b358) Thanks [@porhkz](https://github.com/porhkz)! - Fix badges on readmes

## 2.5.0

### Minor Changes

- [#1589](https://github.com/aligent/cdk-constructs/pull/1589) [`aa03dc3`](https://github.com/aligent/cdk-constructs/commit/aa03dc3ba7c3cbb1f32a523114cdb5d6b9b67ab7) Thanks [@AdamJHall](https://github.com/AdamJHall)! - - Added IP blocklist support (`blockedIPs` and `blockedIPv6s` props) with rules at priority 1-4
  - Added optional AWS Managed Rules:
    - `enableIpReputationList`: AWSManagedRulesAmazonIpReputationList (priority 23)
    - `enableAnonymousIpList`: AWSManagedRulesAnonymousIpList (priority 24)
    - `enableSqlInjection`: AWSManagedRulesSQLiRuleSet (priority 25)
    - `enableBotControl`: AWSManagedRulesBotControlRuleSet (priority 26)
  - Made PHP rules optional with `enablePhpRules` prop (defaults to `true` for backwards compatibility)
  - Added `rateLimitAggregation` prop to switch between `FORWARDED_IP` and `IP` aggregation
  - Exposed new class properties:
    - `webAclArn`: The ARN of the WebACL
    - `ipv4AllowlistArn`: The ARN of the IPv4 allowlist IP Set
    - `ipv6AllowlistArn`: The ARN of the IPv6 allowlist IP Set
    - `ipv4BlocklistArn`: The ARN of the IPv4 blocklist IP Set
    - `ipv6BlocklistArn`: The ARN of the IPv6 blocklist IP Set
  - Exported `REGIONAL` and `CLOUDFRONT` scope constants from package index
  - Added comprehensive test coverage
  - Fixed jest.config.ts displayName and coverageDirectory (was incorrectly set to "basic-auth")

## 2.4.2

### Patch Changes

- [#1573](https://github.com/aligent/cdk-constructs/pull/1573) [`9c26514`](https://github.com/aligent/cdk-constructs/commit/9c26514be321e73b4217aa4a040ac4a91f9b1503) Thanks [@ryanrixxh](https://github.com/ryanrixxh)! - Restucture of the internal codebase and addition of CDK Aspects package. The Aspects package exports a number of usable cdk aspects

## 2.4.1

### Patch Changes

- [#1523](https://github.com/aligent/cdk-constructs/pull/1523) [`2550ceb`](https://github.com/aligent/cdk-constructs/commit/2550cebd411cf2cfd5b92deba17e18a5a3d3d012) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Fixes changeset publishing to work correctly by switching from dist-based builds to in-place compilation within packages

## 2.4.0

### Minor Changes

- [#1512](https://github.com/aligent/cdk-constructs/pull/1512) [`a9a6231`](https://github.com/aligent/cdk-constructs/commit/a9a62319e4528ac2d23f3af96e96cb2427f242f8) Thanks [@TheOrangePuff](https://github.com/TheOrangePuff)! - Adds changeset package to handle release management
