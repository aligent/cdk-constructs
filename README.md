# Aligent CDK Constructs

This repo contains different CDK constructs to assist in setting up static webpages with common features such as: prerender for SEO, regional redirection, data transformation, firewalls, and hosting. All constructs are configurable with the intent to be usable for all use cases.

These are all written for CDK v2. See the official AWS guide for how to migrate from CDK v1: https://docs.aws.amazon.com/cdk/v2/guide/migrating-v2.html.

| Construct                                                           | Description                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [basic-auth](packages/basic-auth)                                   | Restricts CloudFront access behind authentication                                                                            |
| [cloudfront-security-headers](packages/cloudfront-security-headers) | Adds HTTP security headers to origin responses                                                                               |
| [domain-hosting](packages/domain-hosting)                           | Provides a construct to manage a Route53 or external domain along with (optionally) the certificate and records              |
| [esbuild](packages/esbuild)                                         | Provides a construct which allows AWS CDK's bundling process to use the esbuild tool to generate a bundled output            |
| [feature-env-handlers](packages/feature-env-handlers)               | Lambda@Edge handlers to support feature environments                                                                         |
| [geoip-redirect](packages/geoip-redirect)                           | Lambda@Edge handlers to redirect users based on region                                                                       |
| [graphql-server](packages/graphql-mesh-server)                      | Creates a [GraphQL Mesh](https://the-guild.dev/graphql/mesh) server to assist with data transformation from multiple sources |
| [header-change-detection](packages/header-change-detection)         | Creates a Lambda function that periodically scans security headers and sends the results to SNS                              |
| [prerender-fargate](packages/prerender-fargate)                     | Self-hosted prerender to handle prerender bot requests                                                                       |
| [prerender-proxy](packages/prerender-proxy)                         | Provides functions to adjust self-hosted prerender behaviour                                                                 |
| [rabbitmq](packages/rabbitmq)                                       | Create a RabbitMQ cluster within CDK                                                                                         |
| [shared-vpc](packages/shared-vpc)                                   | Creates a single VPC with static IP for micro-services with DNS management                                                   |
| [static-hosting](packages/static-hosting)                           | Construct to deploy infrastructure for static webpage hosting                                                                |
| [step-function-from-file](packages/step-function-from-file)         | Create a Step Function state machine definition from a given JSON or YAML file                                               |
| [waf](packages/waf)                                                 | Configurable WAF infrastructure                                                                                              |

## Contributing

### Development

Make your changes in the package of choice then

- Build it. `yarn nx build <package_name>`
- Pack it. `cd dist/<package-name> && npm pack`
- Import it. `npm i <path_to_tarball>` back in your main codebase

From here anytime you rerun the `npm pack` step your changes will be in sync.

### Testing

To run tests for the entire monorepo:

```bash
yarn nx run-many -t test
```

To run tests for a specific package:

```bash
yarn nx test <package-name>
```

To run a single test file:

```bash
yarn nx test <package-name> --testFile=<test-file-name>
```

### Merging

Once happy with the changes and there's no errors update the readme (if there's any functional changes) and [create a PR](https://github.com/aligent/cdk-constructs/compare) for your branch

Once the changes have been approved, you can commit/merge the changes to the main branch and create a release.

### Creating a release

Each construct/package maintains an independent release cycle.

**Note that for all the finalized releases, the source branch should be the main branch.**

If the release is experimental, you may use the `main` or the feature branch.

**Release Tags**
When making a release (including experimental releases), the release tag should maintain following formation.

- experimental releases: [package-name]-[version number]-[experimental tag]
- finalized releases: [package-name]-[version number]

**Note that the version number should follow `[0-9].[0-9].[0-9]` structure.**
| Experimental | Final |
| ------------ | ----- |
| 1.1.0-beta | 1.1.0 |
