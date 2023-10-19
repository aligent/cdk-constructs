# PrerenderFargate Construct

The PrerenderFargate construct sets up an AWS Fargate service to run a [Prerender] service in an ECS Fargate cluster.  

The Prerender server listens for an HTTP request, takes the URL, and loads it in Headless Chrome, waits for the page to finish loading, and then returns your content to the requesting client.

## AWS Resources Created/Configured by this Construct

- **S3 Bucket:** For storing prerendered web pages.
- **Fargate Service:** For running the Prerender service.
- **ECR Asset:** For managing the Docker image of the Prerender service.
- **VPC & VPC Endpoints:** For network configuration and enabling direct access to S3.
- **Recache API:** (optional) To trigger recaching of URLs.

## Usage and PrerenderFargateOptions

To use the PrerenderFargate construct, you can instantiate it with suitable PrerenderFargateOptions and place it within a CDK stack. The PrerenderOptions parameter allows the developer to customize various aspects of the Prerender service.

### `prerenderName` (string)

- The name of the Prerender service.

### `domainName` (string)

- The domain name to prerender.

### `vpcId` (string, optional)

- The ID of the VPC to deploy the Fargate service in.

### `bucketName` (string, optional)

- The name of the S3 bucket to store prerendered pages in.

### `expirationDays` (number, optional)

- The number of days to keep prerendered pages in the S3 bucket before expiring them.

### `tokenList` (Array of strings, deprecated)

- A list of tokens to use for authentication with the Prerender service. (This parameter is deprecated and will be removed in a future release. Please use the `tokenUrlAssociation` parameter instead. If `tokenUrlAssociation` is provided, `tokenList` will be ignored.)

### `certificateArn` (string)

- The ARN of the SSL certificate to use for HTTPS connections.

### `desiredInstanceCount` (number, optional)

- The desired number of Fargate instances to run.

### `maxInstanceCount` (number, optional)

- The maximum number of Fargate instances to run.

### `instanceCPU` (number, optional)

- The amount of CPU to allocate to each Fargate instance.

### `instanceMemory` (number, optional)

- The amount of memory to allocate to each Fargate instance.

### `enableRedirectCache` (string, optional)

- Whether to enable caching of HTTP redirects.

### `enableS3Endpoint` (boolean, optional)

- Whether to enable the S3 endpoint for the VPC.

### `tokenUrlAssociation` (PrerenderTokenUrlAssociationOptions, optional)

- Configuration for associating tokens with specific domain URLs. During the recaching process, these tokens will be used to validate the request.

## Example

Here's an example of how to use the PrerenderFargate construct in a TypeScript CDK application:

```typescript
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { PrerenderFargate, PrerenderFargateOptions } from "@aligent/cdk-prerender-fargate";


export class RagPrerenderStackStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    new PrerenderFargate(this, "PrerenderService", {
      prerenderName: "myPrerender",
      bucketName: "myPrerenderBucket",
      expirationDays: 7,
      vpcId: "vpc-xxxxxxxx",
      desiredInstanceCount: 1,
      instanceCPU: 512,
      instanceMemory: 1024,
      domainName: "prerender.mydomain.com",
      certificateArn:
        "arn:aws:acm:region:account:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      enableRedirectCache: "false",
      maxInstanceCount: 2,
      enableS3Endpoint: true,
      tokenUrlAssociation: {
        token1: ["https://example.com", "https://acme.example.com"],
        token2: ["https://example1.com", "https:acme.example1.com"],
      },
      ssmPathPrefix: "/prerender/recache/tokens",
    });
  }
}
```

[Prerender]:https://github.com/prerender/prerender
