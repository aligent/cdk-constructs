import { PrerenderTokenUrlAssociationProps } from "./recaching/prerender-tokens";

/**
 * Options for configuring the Prerender Fargate construct.
 */
export interface PrerenderFargateOptions {
  /**
   * The name of the Prerender service.
   */
  prerenderName: string;
  /**
   * The domain name to prerender.
   */
  domainName: string;
  /**
   * The ID of the VPC to deploy the Fargate service in.
   */
  vpcId?: string;
  /**
   * The name of the S3 bucket to store prerendered pages in.
   */
  bucketName?: string;
  /**
   * The number of days to keep prerendered pages in the S3 bucket before expiring them.
   */
  expirationDays?: number;
  /**
   * A list of tokens to use for authentication with the Prerender service.
   * This parameter is deprecated and will be removed in a future release.
   * Please use the `tokenUrlAssociation` parameter instead.
   * __If `tokenUrlAssociation` is provided, `tokenList` will be ignored__
   */
  tokenList: Array<string>;
  /**
   * The ARN of the SSL certificate to use for HTTPS connections.
   */
  certificateArn: string;
  /**
   * The desired number of Fargate instances to run.
   */
  desiredInstanceCount?: number;
  /**
   * The maximum number of Fargate instances to run.
   */
  maxInstanceCount?: number;
  /**
   * The amount of CPU to allocate to each Fargate instance.
   */
  instanceCPU?: number;
  /**
   * The amount of memory to allocate to each Fargate instance.
   */
  instanceMemory?: number;
  /**
   * Whether to enable caching of HTTP redirects.
   */
  enableRedirectCache?: string;
  /**
   * Whether to enable the S3 endpoint for the VPC.
   */
  enableS3Endpoint?: boolean;
  /**
   * Configuration for associating tokens with specific domain URLs.
   * During the reacaching process, these tokens will be used to validate the request.
   * ### Example:
   * ```typescript
   * {
   *    tokenUrlAssociation: {
   *      token1: [
   *        "https://example.com",
   *        "https://acme.example.com"],
   *      token2: [
   *        "https://example1.com",
   *        "https://acme.example1.com"]
   *    },
   *    ssmPathPrefix: "/prerender/recache/tokens"
   * }
   * ```
   */
  tokenUrlAssociation?: PrerenderTokenUrlAssociationProps;
}
