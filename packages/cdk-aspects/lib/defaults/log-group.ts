import { RemovalPolicy, type IAspect } from "aws-cdk-lib";
import {
  CfnLogGroup,
  LogGroup,
  RetentionDays,
  type LogGroupProps,
} from "aws-cdk-lib/aws-logs";
import { IConstruct } from "constructs";

interface Config {
  duration: "SHORT" | "MEDIUM" | "LONG";
}

/**
 * Aspect that automatically applies configuration-aware defaults to CloudWatch Log Groups
 *
 * Visits all constructs in the scope and automatically applies configuration-specific defaults to L2 log groups.
 * Different configurations balance between cost optimization and data retention needs.
 *
 * - Removal policy is always overridden.
 * - Retention is applied when the L2 `LogGroup` has no explicit `retention` (CDK renders this as `TWO_YEARS`).
 * - Any other explicit `retention`, including `INFINITE`, is respected.
 * - An explicit `TWO_YEARS` is overridden, since it is indistinguishable from the CDK default.
 * - L1 `CfnLogGroup`s are not modified.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all log groups
 * Aspects.of(app).add(new LogGroupDefaultsAspect({ duration: 'SHORT' }));
 *
 * // Retention (1 week) and removal policy (DESTROY) applied automatically
 * new LogGroup(stack, 'MyLogGroup');
 *
 * // Explicit retention is respected; removal policy is still applied
 * new LogGroup(stack, 'AuditLogGroup', { retention: RetentionDays.ONE_YEAR });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_logs.LogGroup.html
 */
export class LogGroupDefaultsAspect implements IAspect {
  private readonly defaultProps: LogGroupProps;

  /**
   * Creates a new LogGroupDefaultsAspect
   *
   * @param config - Configuration identifier used to select appropriate defaults.
   */
  constructor(config: Config) {
    const props = this.retentionProperties(config.duration);
    this.defaultProps = { ...props };
  }

  /**
   * Get duration-specific log group properties
   *
   * @param duration - The duration to get the log group properties for
   * @returns The log group properties for the duration
   */
  private retentionProperties(duration: "SHORT" | "MEDIUM" | "LONG") {
    switch (duration) {
      case "SHORT":
        return {
          retention: RetentionDays.ONE_WEEK,
          removalPolicy: RemovalPolicy.DESTROY,
        };
      case "MEDIUM":
        return {
          retention: RetentionDays.SIX_MONTHS,
          removalPolicy: RemovalPolicy.DESTROY,
        };
      default:
        return {
          retention: RetentionDays.TWO_YEARS,
          removalPolicy: RemovalPolicy.RETAIN,
        };
    }
  }

  /**
   * Visits a construct and applies configuration-appropriate defaults
   *
   * Always applies the configuration-specific removal policy, and applies
   * retention to log groups that don't set their own.
   *
   * @param node - The construct to potentially modify
   */
  visit(node: IConstruct): void {
    if (node instanceof LogGroup) {
      if (this.defaultProps.removalPolicy) {
        node.applyRemovalPolicy(this.defaultProps.removalPolicy);
      }

      if (this.defaultProps.retention) {
        const cfnLogGroup = node.node.defaultChild as CfnLogGroup;
        /**
         * The L2 renders an omitted `retention` as `TWO_YEARS`, and leaves
         * `retentionInDays` undefined only for an explicit `INFINITE` (or the
         * `DELIVERY` class). So `TWO_YEARS` is the only "unset" signal we get.
         */
        if (cfnLogGroup?.retentionInDays === RetentionDays.TWO_YEARS) {
          cfnLogGroup.retentionInDays = this.defaultProps.retention;
        }
      }
    }
  }
}
