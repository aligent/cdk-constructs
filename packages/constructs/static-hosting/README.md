# Aligent AWS Static Hosting

## Overview

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/static-hosting/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/static-hosting/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-static-hosting?color=green)

This repository defines a CDK construct for hosting a static website on AWS using S3 and CloudFront.

It can be imported and used within CDK applications. By default this construct will create a CloudFront distribution with an S3 bucket as the origin. It will also create an IAM user and group that have permission to create files in the S3 bucket.

It has the following features that can optionally be enabled:

- Create a DNS record in an existing hosted zone
- Store CloudFront logs in an S3 bucket with configurable retention
- Add a custom backend origin
- Remap static files to the the S3 or backend origin

![static hosting diagram](docs/static_hosting.png)

## Installation

```bash
npm install @aligent/cdk-static-hosting aws-cdk-lib constructs
```

Or with yarn:

```bash
yarn add @aligent/cdk-static-hosting aws-cdk-lib constructs
```

### Peer Dependencies

This package has peer dependencies on:
- `aws-cdk-lib` (^2.120.0)
- `constructs` (^10.0.0)

Make sure to install compatible versions of these packages in your CDK application.

## Usage and PrerenderFargateOptions
### `domainName`(string)
- Domain name for the stack. Combined with the subDomainName it is used as the name for the S3 origin and an alternative domain name for the CloudFront distribution

### `subDomainName`(string)
- Subdomain name for the stack. Combined with the domainName it is used as the name for the S3 origin and an alternative domain name for the CloudFront distribution

### `extraDistributionCnames` (ReadonlyArray&lt;string&gt;)

- An array of additional Cloudfront alternative domain names.

Default: **undefined**

### `certificateArn` (string)

- The arn of the certificate to attach to the CloudFront distribution. Must be created in us-east-1

### `backendHost` (string)

- Custom backend host to add as a second origin to the CloudFront distribution

Default: **undefined**

### `zoneName` (string)

- The hosted zone name to create a DNS record in. If not supplied a DNS record will not be created

Default: **undefined**

### `createPublisherGroup` (boolean)

- Whether to create a group with permissions to publish to the S3 bucket.

Default: **true**

### `createPublisherUser` (boolean)

- Whether to create a user with permissions to publish to the S3 bucket. The user will not have permissions unless the publisher group is also created

Default: **true**

### `enableCloudFrontAccessLogging` (boolean)

- Enable CloudFront access logs

Default: **false**

### `cloudFrontLogRetentionDays` (number)

- Number of days to retain CloudFront access logs before automatic deletion
- Only applies when `enableCloudFrontAccessLogging` is enabled
- Uses S3 lifecycle rules to automatically delete logs after the specified period
- Set to a positive number to enable automatic deletion

Default: **undefined** (logs retained indefinitely)

### `enableS3AccessLogging` (boolean)

- Enable S3 access logging

Default: **false**

### `enableErrorConfig` (boolean)

- Enable returning the errorResponsePagePath on a 404. Not required when using Prerender or Feature environment Lambda@Edge functions

Default: **false**

### `errorResponsePagePath` (string)

- Custom error response page path

Default: **/index.html**

### `enableStaticFileRemap` (boolean)

- Create behaviours for the following file extensions to route straight to the S3 origin:
  - js, css, json, svg, jpg, jpeg, png, gif, ico, woff, woff2, otf

Default: **true**

### `defaultBehaviourPrefixes` (prefix: string), (behaviourOverride: Partial&lt;BehaviorOptions&gt;) 

```
{
    prefix: string;
    behaviourOverride: Partial<BehaviorOptions>;
  }[]
```

- Overrides default behaviour paths with a prefix and takes in behviour options to apply on the prefix behaviour

Default: **true**

### `staticFileRemapOptions` (Partial&lt;BehaviorOptions&gt;)

- Optional additional properties for static file remap behaviours

Default: **none**

### `remapPaths` (remapPath[])

- Paths to remap on the default behaviour. For example you might remap deployed_sitemap.xml -> sitemap.xml
- Created a behaviour in CloudFront to handle the remap. If the paths are different it will also deploy a Lambda@Edge function to perform the required remap. The "to" path is optional, and the Lambda@Edge function will not be deployed if not provided.

Default: **undefined**

### `remapBackendPaths` (remapPath[])

- Functions the same as remapPaths but uses the backendHost as the origin.
- Requires a valid backendHost to be configured

Default: **undefined**

### `defaultRootObject` (string)

- Override the default root object

Default: **index.html**

### `enforceSSL` (boolean)

- Enforce ssl on bucket requests

Default: **true**

### `disableCSP` (boolean)

- Disable the use of the CSP header

Default: **false**

### `csp` (CSP)

- Adds custom CSP directives and URLs to the header.
- AWS limits the max header size to 1kb, this is too small for complex csp headers.
- The main purpose of this csp header is to provide a method of setting a report-uri.

Default: **undefined**

### `explicitCSP` (boolean)

- This will generate a csp based *purely* on the provided csp object. Therefore disabling the automatic adding of common use-case properties.

Default: **false**

### `s3ExtendedProps` (BucketProps)

- Extend the default props for S3 bucket

Default: **undefined**

### `webAclArn` (string)

- Add an external WAF via an arn

Default: **undefined**

### `responseHeadersPolicies` (ResponseHeaderMappings)

- Add response headers policies to the default behaviour

Default: **undefined**

### `additionalBehaviors` (Record&lt;string, BehaviorOptions&gt;)

- Additional behaviours

Default: **undefined**

### `defaultBehaviorEdgeLambdas` (EdgeLambda[])

- Lambda@Edge functions to add to the default behaviour

Default: **undefined**

### `defaultBehaviorRequestPolicy` (CachePolicy)

- A request policy used on the default behavior

Default: **undefined**

### `defaultBehaviorCachePolicy` (EdgeLambda[])

- A cache policy used on the default behavior

Default: **undefined**

### `additionalDefaultOriginRequestHeaders` (string[])

- Additional headers to include in OriginRequestHeaderBehavior

### `additionalDefaultCacheKeyHeaders` (string[])

- Additional headers to include in CacheHeaderBehavior

### `overrideLogicalId` (string)

- After switching constructs, you need to maintain the same logical ID for the underlying CfnDistribution if you wish to avoid the deletion  and recreation of your distribution.
- To do this, use escape hatches to override the logical ID created by the new Distribution construct with the logical ID created by theold construct


See: [Migrating from original cfnDistribution - AWS Docs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#migrating-from-the-original-cloudfrontwebdistribution-to-the-newer-distribution-construct)

Default: **undefined**

### `exportPrefix` (string)

- A string to prefix CloudFormation outputs with

Default: **undefined**

### `exportPrefix` (string)

- Add a comment to the CloudFront distribution

Default: **undefined**

## Example

The following CDK snippet can be used to provision a static hosting stack using this construct.

```
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { StaticHosting, StaticHostingProps } from '@aligent/cdk-static-hosting'
import { Construct, Stack, StackProps } from '@aws-cdk/core';


const HostingStackProps : StaticHostingProps = {
    subDomainName: 'sub.domain',
    domainName: 'domain.tld',
    certificateArn: 'arn:aws:acm:us-east-1:123456789:certificate/some-arn-id',
    createDnsRecord: false,
    enableErrorConfig: true
};

class HostingStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        new StaticHosting(this, 'hosting-stack', HostingStackProps);
    }
}

const app = new cdk.App();

new HostingStack(app, 'hosting-stack', {
     env: {
          region: 'ap-southeast-2',
          account: 'account-id',
     }
});

```

### Response Header Policies

You can initialize [Response Headers Policies], map them and pass to the construct.

1. Create a policy

    ```sh
    // Creating a custom response headers policy -- all parameters optional
    const reportUriPolicy = new ResponseHeadersPolicy(this, 'ReportUriPolicy', {
        responseHeadersPolicyName: 'ReportUriPolicy',
        comment: 'To enable CSP Reporting',
        customHeadersBehavior: {
            customHeaders: [
                { 
                    header: 'content-security-policy-report-only', 
                    value: `default-src 'none'; form-action 'none'; frame-ancestors 'none'; report-uri https://some-report-uri-domain.report-uri.com/r/t/csp/wizard`, 
                    override: true 
                },
            ],
        },
    });
    ```

2. Attached policy to desired cache behavior or path

    ```sh
    const responseHeaders: ResponseHeaderMappings[] = [{
        header: reportUriPolicy,
        pathPatterns: ['/au*', '/nz*']
        attachToDefault: false
    }];
    ```

    If you should attached the policy to the Default Behavior, set `attachToDefault: true`

3. Include the config as props

    ```sh
    new StaticHosting(this, 'pwa-stack', {...staticProps, ...{behaviors, customOriginConfigs, responseHeaders}});
    ```

[Response Headers Policies]:https://docs.aws.amazon.com/cdk/api/v1/docs/@aws-cdk_aws-cloudfront.ResponseHeadersPolicy.html
