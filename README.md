# Aligent CDK Constructs

This repo contains all of Aligent's CDK constructs.

These are all written for CDK v2. See the offical AWS guide for how to migrate from CDK v1: https://docs.aws.amazon.com/cdk/v2/guide/migrating-v2.html.

Construct | Description
-- | --
[basic-auth](packages/basic-auth) |
[cloudfront-security-headers](packages/cloudfront-security-headers) |
[feature-env-handlers](packages/feature-env-handlers) | Lambda@Edge handlers to support feature environments
[geoip-redirect](packages/geoip-redirect) |
[graphql-server](packages/graphql-server) |
[prerender-fargate](packages/prerender-fargate) |
[prerender-proxy](packages/prerender-proxy) |
[rabbitmq](packages/rabbitmq) |
[shared-vpc](packages/shared-vpc) |
[static-hosting](packages/static-hosting) |
[waf](packages/waf) |

## Making a Release

Each construct/package maintains an independent release cycle.
Once the changes have been approved, you can commit/merge the changes to the main branch and create a release.
**Note that for all the finalized releases, the source branch should be the main branch.**

If the release is experimental, you may use the `main` or the feature branch.

### Release Tags

When making a release (including experimental releases), the release tag should maintain following formation.

- experimental releases: [package-name]-[version number]-[experimental tag]
- finalized releases: [package-name]-[version number]

**Note that the version number should follow `[0-9].[0-9].[0-9]` structure.**

| <!-- -->      | <!-- -->      |
|---------------|---------------|
| Experimental  | 1.1.0-beta    |
| Final         | 1.1.0         |
