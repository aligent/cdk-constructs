import { Duration, RemovalPolicy, type IAspect } from "aws-cdk-lib";
import { Bucket, CfnBucket, type BucketProps } from "aws-cdk-lib/aws-s3";
import { IConstruct } from "constructs";

/** Exposes the private {@link Bucket.enableAutoDeleteObjects} method. */
interface BucketWithAutoDelete {
  enableAutoDeleteObjects(): void;
}

/**
 * Configuration for the {@link S3DefaultsAspect}.
 *
 * @property duration - Controls the retention behaviour applied to S3 buckets:
 *   - `SHORT`  — 30-day object expiration, auto-delete on stack removal.
 *   - `MEDIUM` — 90-day object expiration, auto-delete on stack removal.
 *   - `LONG`   — No expiration, bucket is retained on stack removal.
 */
interface Config {
  duration: "SHORT" | "MEDIUM" | "LONG";
}

/**
 * CDK Aspect that applies duration-based lifecycle and removal policies to S3 Buckets.
 *
 * When added to a scope, this aspect visits every {@link Bucket} construct and:
 * 1. Sets the removal policy (`DESTROY` for SHORT/MEDIUM, `RETAIN` for LONG).
 * 2. Adds lifecycle rules with an object expiration (30 or 90 days) — only if the
 *    bucket does not already have an explicit lifecycle configuration.
 *
 * @example
 * ```typescript
 * import { Aspects } from 'aws-cdk-lib';
 *
 * // Short-lived buckets: objects expire after 30 days, bucket deleted with stack
 * Aspects.of(stack).add(new S3DefaultsAspect({ duration: 'SHORT' }));
 *
 * // Long-lived buckets: no expiration, bucket retained on stack removal
 * Aspects.of(stack).add(new S3DefaultsAspect({ duration: 'LONG' }));
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_s3.Bucket.html
 */
export class S3DefaultsAspect implements IAspect {
  private readonly defaultProps: BucketProps;

  /**
   * Creates a new S3DefaultsAspect.
   *
   * @param config - Determines which retention profile to apply to buckets in scope.
   */
  constructor(config: Config) {
    const props = this.retentionProperties(config.duration);
    this.defaultProps = { ...props };
  }

  /**
   * Returns duration-specific bucket properties (lifecycle rules, removal policy,
   * and auto-delete flag).
   *
   * @param duration - The retention profile to resolve.
   * @returns Partial {@link BucketProps} appropriate for the given duration.
   */
  private retentionProperties(duration: "SHORT" | "MEDIUM" | "LONG") {
    switch (duration) {
      case "SHORT":
        return {
          lifecycleRules: [{ expiration: Duration.days(30) }],
          removalPolicy: RemovalPolicy.DESTROY,
          autoDeleteObjects: true,
        };
      case "MEDIUM":
        return {
          lifecycleRules: [{ expiration: Duration.days(90) }],
          removalPolicy: RemovalPolicy.DESTROY,
          autoDeleteObjects: true,
        };
      default:
        return {
          lifecycleRules: [],
          removalPolicy: RemovalPolicy.RETAIN,
        };
    }
  }

  /**
   * Visits a construct and, if it is an S3 {@link Bucket}, applies the
   * configured removal policy, auto-delete behaviour, and lifecycle rules.
   *
   * When `autoDeleteObjects` is enabled, we call the private `enableAutoDeleteObjects` which
   * provisions a Lambda-backed custom resource is to empty the bucket before CloudFormation deletes it.
   *
   * Lifecycle rules are only added when the bucket's underlying
   * {@link CfnBucket} does not already have a `lifecycleConfiguration`.
   *
   * @param node - The construct being visited by the CDK aspect traversal.
   */
  visit(node: IConstruct): void {
    if (node instanceof Bucket) {
      const { lifecycleRules, removalPolicy, autoDeleteObjects } =
        this.defaultProps;
      if (removalPolicy) {
        node.applyRemovalPolicy(removalPolicy);
      }

      if (autoDeleteObjects) {
        // NOTE: This relies on a private CDK API and may break in future aws-cdk-lib releases.
        // @see https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/aws-s3/lib/bucket.ts#L3357
        (node as unknown as BucketWithAutoDelete).enableAutoDeleteObjects();
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
