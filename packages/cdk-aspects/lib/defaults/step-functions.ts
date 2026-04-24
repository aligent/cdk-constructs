import { type IAspect } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import {
  CfnStateMachine,
  LogLevel,
  StateMachine,
  StateMachineType,
} from "aws-cdk-lib/aws-stepfunctions";
import { IConstruct } from "constructs";

/**
 * Aspect that automatically applies tracing and logging settings to Step Functions
 *
 * Visits all constructs in the scope and automatically applies X-Ray tracing to all
 * state machines. For EXPRESS state machines, automatically creates log groups and
 * configures comprehensive logging for enhanced observability.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all Step Functions
 * Aspects.of(app).add(new StepFunctionDefaultsAspect());
 *
 * // Step Functions automatically inherit defaults
 * new StateMachine(stack, 'MyWorkflow', {
 *   stateMachineType: StateMachineType.EXPRESS,
 *   definitionBody: DefinitionBody.fromFile('workflow.asl.yaml'),
 *   // tracing enabled and logging configured automatically for EXPRESS
 * });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions.StateMachine.html
 */
export class StepFunctionsDefaultsAspect implements IAspect {
  /**
   * Visits a construct and applies tracing and logging settings if it's a StateMachine
   *
   * Enables X-Ray tracing for all state machines. For EXPRESS state machines that don't
   * already have logging configured, automatically creates log groups and configures
   * comprehensive logging with full execution data capture.
   *
   * @param node - The construct to potentially modify
   */
  visit(node: IConstruct): void {
    if (node instanceof StateMachine) {
      const cfnStateMachine = node.node.defaultChild as CfnStateMachine;

      if (cfnStateMachine) {
        // Apply tracing if not already set
        if (cfnStateMachine.tracingConfiguration === undefined) {
          cfnStateMachine.tracingConfiguration = {
            enabled: true,
          };
        }

        // For EXPRESS state machines, configure logging if not already set
        if (
          cfnStateMachine.stateMachineType === StateMachineType.EXPRESS &&
          cfnStateMachine.loggingConfiguration === undefined
        ) {
          const logGroup = new LogGroup(node, "LogGroup", {
            logGroupName: `/aws/vendedlogs/states/${node.node.id}`,
          });

          cfnStateMachine.loggingConfiguration = {
            destinations: [
              {
                cloudWatchLogsLogGroup: {
                  logGroupArn: logGroup.logGroupArn,
                },
              },
            ],
            level: LogLevel.ALL,
            includeExecutionData: true,
          };

          // Grant the state machine role the permissions required to deliver logs.
          // Mirrors what CDK's StateMachine.buildLoggingConfiguration() does internally.
          //
          // resources: ["*"] is intentional — all eight actions are vended-log-delivery
          // control-plane APIs that operate at the account level and do not support
          // resource-level scoping against a specific log group ARN.
          // See: https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazoncloudwatchlogs.html
          //      https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html
          node.addToRolePolicy(
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: [
                "logs:CreateLogDelivery",
                "logs:GetLogDelivery",
                "logs:UpdateLogDelivery",
                "logs:DeleteLogDelivery",
                "logs:ListLogDeliveries",
                "logs:PutResourcePolicy",
                "logs:DescribeResourcePolicies",
                "logs:DescribeLogGroups",
              ],
              resources: ["*"],
            })
          );
        }
      }
    }
  }
}
