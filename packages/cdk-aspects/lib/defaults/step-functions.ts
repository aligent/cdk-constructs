import { type IAspect } from "aws-cdk-lib";
import { CfnLogGroup, LogGroup } from "aws-cdk-lib/aws-logs";
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
          // Create a log group for the state machine
          const logGroup = new LogGroup(node, "LogGroup", {
            logGroupName: `/aws/vendedlogs/states/${node.node.id}`,
          });

          // Get the underlying CFN log group to access its ARN
          const cfnLogGroup = logGroup.node.defaultChild as CfnLogGroup;

          cfnStateMachine.loggingConfiguration = {
            destinations: [
              {
                cloudWatchLogsLogGroup: {
                  logGroupArn: cfnLogGroup.attrArn,
                },
              },
            ],
            level: LogLevel.ALL,
            includeExecutionData: true,
          };
        }
      }
    }
  }
}
