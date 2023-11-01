import { PrerenderTokenUrlAssociationOptions } from "./recaching/prerender-tokens";

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
   * *If `tokenUrlAssociation` is provided, `tokenList` will be ignored*
   */
  tokenList: Array<string>;
  /**
   * The ARN of the SSL certificate to use for HTTPS connections.
   */
  certificateArn: string;
  /**
   * The minimum number of Fargate instances to run.
   */
  minInstanceCount?: number;
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
  tokenUrlAssociation?: PrerenderTokenUrlAssociationOptions;
  /**
   * Prerender Fargate Scaling option
   * This allows to alter the scaling behavior. The default configuration should be sufficient
   * for most of the cases.
   */
  prerenderFargateScalingOptions?: PrerenderFargateScalingOptions;
  /**
   * Prerender Fargate Re-caching options
   * This allows to alter the re-caching behavior. The default configuration should be sufficient.
   */
  prerenderFargateRecachingOptions?: PrerenderFargateRecachingOptions;
}

/**
 * Prerender Fargate Scaling option
 */
export interface PrerenderFargateScalingOptions {
  /**
   * Fargate service health check grace period.
   * The minimum number of tasks, specified as a percentage of
   * the Amazon ECS service's DesiredCount value, that must
   * continue to run and remain healthy during a deployment.
   * @default - 20 seconds
   */
  healthCheckGracePeriod?: number;
  /**
   * Fargate service minimum healthy percent.
   * @default - 0
   */
  minHealthyPercent?: number;
  /**
   * Fargate service maximum healthy percent.
   * This limits the scheduler from starting a replacement task first,
   * the scheduler will stop an unhealthy task one at a time at random to
   * free up capacity, and then start a replacement task
   * @default - 200
   */
  maxHealthyPercent?: number;
  /**
   * Health check interval in seconds.
   * @default - 50
   */
  healthCheckInterval?: number;
  /**
   * Scale in cooldown in seconds.
   * @default - 60
   */
  scaleInCooldown?: number;
  /**
   * Scale out cooldown in seconds.
   * @default - 60
   */
  scaleOutCooldown?: number;
  /**
   * The number of consecutive health check failures required before considering a task unhealthy.
   * @default - 5
   */
  unhealthyThresholdCount?: number;
}

/**
 * Prerender Fargate Re-caching options
 */
export interface PrerenderFargateRecachingOptions {
  /**
   * The maximum number of concurrent executions of the Prerender Re-cache API.
   * @default - 1
   */
  maxConcurrentExecutions: number;
}
