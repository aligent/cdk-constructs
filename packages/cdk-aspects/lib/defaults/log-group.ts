import { RemovalPolicy, type IAspect } from 'aws-cdk-lib';
import { CfnLogGroup, LogGroup, RetentionDays, type LogGroupProps } from 'aws-cdk-lib/aws-logs';
import { IConstruct } from 'constructs';

interface Config {
    duration: 'SHORT' | 'MEDIUM' | 'LONG';
}

/**
 * Aspect that automatically applies configuration-aware defaults to CloudWatch Log Groups
 *
 * Visits all constructs in the scope and automatically applies configuration-specific to log groups.
 * Different configurations balance between cost optimization and data retention needs.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all log groups
 * Aspects.of(app).add(new LogGroupDefaultsAspect({ duration: 'SHORT' }));
 *
 * // Log groups automatically inherit configuration defaults
 * new LogGroup(stack, 'MyLogGroup', {
 *   // retention and removal policy applied automatically
 * });
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
    private retentionProperties(duration: 'SHORT' | 'MEDIUM' | 'LONG') {
        switch (duration) {
            case 'SHORT':
                return { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.DESTROY };
            case 'MEDIUM':
                return {
                    retention: RetentionDays.SIX_MONTHS,
                    removalPolicy: RemovalPolicy.DESTROY,
                };
            default:
                return { retention: RetentionDays.TWO_YEARS, removalPolicy: RemovalPolicy.RETAIN };
        }
    }

    /**
     * Visits a construct and applies configuration-appropriate defaults
     *
     * Applies configuration-specific retention and removal policies to log groups
     * that don't already have these properties explicitly set.
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
                if (cfnLogGroup && cfnLogGroup.retentionInDays === undefined) {
                    cfnLogGroup.retentionInDays = this.defaultProps.retention;
                }
            }
        }
    }
}
