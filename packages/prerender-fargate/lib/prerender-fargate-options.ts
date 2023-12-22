import * as ec2 from "aws-cdk-lib/aws-ec2";

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
   * @default - The default VPC will be used
   * @deprecated Use vpc instead and perform the lookup outside of the construct if needed.
   */
  vpcId?: string;
  /**
   * The VPC to deploy the Fargate service in.
   * @default - The default VPC will be used
   */
  vpc?: ec2.IVpc;
  /**
   * The name of the S3 bucket to store prerendered pages in.
   */
  bucketName?: string;
  /**
   * The number of days to keep pre-rendered pages in the S3 bucket before expiring them.
   * @default - 10 days
   */
  expirationDays?: number;
  /**
   * The ARN of the SSL certificate to use for HTTPS connections.
   */
  certificateArn: string;
  /**
   * A pre-configured AWS Secrets Manager secret name for Prerender and Recache API authentication.
   * The format of the secret value is: Map<string, string[]>, e.g.,
   * {"token1": "https://www.example1.com,https://www.mydomain1.com", "token2":"https://www.example2.com,https://www.mydomain2.com"}
   */
  tokenSecret: string;
  /**
   * The minimum number of Fargate instances to run.
   * @default - 1
   */
  minInstanceCount?: number;
  /**
   * The desired number of Fargate instances to run.
   * @default - 1
   */
  desiredInstanceCount?: number;
  /**
   * The maximum number of Fargate instances to run.
   * @default - 1
   */
  maxInstanceCount?: number;
  /**
   * The amount of CPU to allocate to each Fargate instance.
   * @default - 0.5 vCPU
   */
  instanceCPU?: number;
  /**
   * The amount of memory to allocate to each Fargate instance.
   * @default - 512MB
   */
  instanceMemory?: number;
  /**
   * Whether to enable caching of HTTP redirects.
   * @default - false
   */
  enableRedirectCache?: boolean;
  /**
   * Whether to enable the S3 endpoint for the VPC.
   * @default - false
   */
  enableS3Endpoint?: boolean;
  /**
   * Prerender Fargate Scaling option
   * This allows to alter the scaling behavior. The default configuration should be sufficient
   * for most of the cases.
   */
  prerenderFargateScalingOptions?: PrerenderFargateScalingOptions;
  /**
   * Prerender Fargate Re-caching options
   * This allows to alter the re-caching behavior. The default configuration should be sufficient.
   * @default - { maxConcurrentExecutions: 1 }
   */
  prerenderFargateRecachingOptions?: PrerenderFargateRecachingOptions;
  /**
   * Enable Re-caching API
   * @default - true
   */
  enableRecache?: boolean;
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
  maxConcurrentExecutions?: number;
}
