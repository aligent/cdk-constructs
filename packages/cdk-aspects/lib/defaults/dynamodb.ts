import { RemovalPolicy, type IAspect } from "aws-cdk-lib";
import { CfnTable, Table, type TableProps } from "aws-cdk-lib/aws-dynamodb";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { IConstruct } from "constructs";

interface Config {
  duration: "SHORT" | "MEDIUM" | "LONG";
}

/**
 * Aspect that automatically applies configuration-aware defaults to DynamoDB Tables
 *
 * Visits all constructs in the scope and automatically applies configuration-specific
 * removal policies and point-in-time recovery settings to DynamoDB tables.
 * Different configurations balance between cost optimization and data retention needs.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all tables
 * Aspects.of(app).add(new DynamoDbDefaultsAspect({ duration: 'SHORT' }));
 *
 * // Tables automatically inherit configuration defaults
 * new Table(stack, 'MyTable', {
 *   // point-in-time recovery and removal policy applied automatically
 * });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.Table.html
 */
export class DynamoDbDefaultsAspect implements IAspect {
  private readonly defaultProps: TableProps;

  /**
   * Creates a new DynamoDbDefaultsAspect
   *
   * @param config - Configuration identifier used to select appropriate defaults.
   */
  constructor(config: Config) {
    this.defaultProps = this.retentionProperties(config.duration);
  }

  /**
   * Get duration-specific DynamoDB table properties
   *
   * @param duration - The duration to get the table properties for
   * @returns The table properties for the duration
   */
  private retentionProperties(
    duration: "SHORT" | "MEDIUM" | "LONG"
  ): TableProps {
    switch (duration) {
      case "SHORT":
        return {
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: false,
          },
          removalPolicy: RemovalPolicy.DESTROY,
        };
      case "MEDIUM":
        return {
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
            recoveryPeriodInDays: RetentionDays.ONE_MONTH,
          },
          removalPolicy: RemovalPolicy.DESTROY,
        };
      default:
        return {
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
            recoveryPeriodInDays: RetentionDays.THREE_MONTHS,
          },
          removalPolicy: RemovalPolicy.RETAIN,
        };
    }
  }

  /**
   * Visits a construct and applies configuration-appropriate defaults
   *
   * Applies configuration-specific point-in-time recovery and removal policies
   * to tables that don't already have these properties explicitly set.
   *
   * @param node - The construct to potentially modify
   */
  visit(node: IConstruct): void {
    if (node instanceof Table) {
      const { pointInTimeRecoverySpecification, removalPolicy } =
        this.defaultProps;

      if (removalPolicy) {
        node.applyRemovalPolicy(removalPolicy);
      }

      if (pointInTimeRecoverySpecification !== undefined) {
        const cfnTable = node.node.defaultChild as CfnTable;
        if (
          cfnTable &&
          cfnTable.pointInTimeRecoverySpecification === undefined
        ) {
          cfnTable.pointInTimeRecoverySpecification = {
            ...pointInTimeRecoverySpecification,
          };
        }
      }
    }
  }
}
