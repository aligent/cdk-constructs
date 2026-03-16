import { Duration, RemovalPolicy, type IAspect } from "aws-cdk-lib";
import { Bucket, CfnBucket, type BucketProps } from "aws-cdk-lib/aws-s3";
import { IConstruct } from "constructs";

interface Config {
  duration: "SHORT" | "MEDIUM" | "LONG";
}

/**
 * Aspect that automatically applies configuration-aware defaults to S3 Buckets
 *
 * Visits all constructs in the scope and automatically applies configuration-specific
 * lifecycle and removal policies to S3 buckets. Different configurations balance
 * between cost optimization and data retention needs.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all buckets
 * Aspects.of(app).add(new S3DefaultsAspect({ autoDelete: true, duration: 'SHORT' }));
 *
 * // Buckets automatically inherit configuration defaults
 * new Bucket(stack, 'MyBucket', {
 *   // lifecycle and removal policy applied automatically
 * });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html
 */
export class S3DefaultsAspect implements IAspect {
  private readonly defaultProps: BucketProps;

  /**
   * Creates a new S3DefaultsAspect
   *
   * @param config - Configuration identifier used to select appropriate defaults.
   */
  constructor(config: Config) {
    const props = this.retentionProperties(config.duration);
    this.defaultProps = { ...props };
  }

  /**
   * Get duration-specific object expiration
   *
   * @param duration - The duration to get the expiration for
   * @returns The expiration Duration, or undefined for LONG retention
   */
  private retentionProperties(duration: "SHORT" | "MEDIUM" | "LONG") {
    switch (duration) {
      case "SHORT":
        return {
          lifecycleRules: [{ expiration: Duration.days(30) }],
          removalPolicy: RemovalPolicy.DESTROY,
        };
      case "MEDIUM":
        return {
          lifecycleRules: [{ expiration: Duration.days(90) }],
          removalPolicy: RemovalPolicy.DESTROY,
        };
      default:
        return {
          lifecycleRules: [],
          removalPolicy: RemovalPolicy.RETAIN,
        };
    }
  }

  /**
   * Visits a construct and applies configuration-appropriate defaults
   *
   * Applies a removal policy and lifecycle rules to buckets that don't
   * already have a lifecycle configuration explicitly set.
   *
   * @param node - The construct to potentially modify
   */
  visit(node: IConstruct): void {
    if (node instanceof Bucket) {
      const { lifecycleRules, removalPolicy } = this.defaultProps;
      if (removalPolicy) {
        node.applyRemovalPolicy(removalPolicy);
      }

      if (lifecycleRules?.length) {
        const cfnBucket = node.node.defaultChild as CfnBucket;
        if (cfnBucket && cfnBucket.lifecycleConfiguration === undefined) {
          lifecycleRules.forEach(rule => node.addLifecycleRule(rule));
        }
      }
    }
  }
}
