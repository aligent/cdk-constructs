import { App, Aspects, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import {
  DefinitionBody,
  Pass,
  StateMachine,
  StateMachineType,
} from "aws-cdk-lib/aws-stepfunctions";
import { StepFunctionsDefaultsAspect } from "./step-functions";

const makeStateMachine = (
  stack: Stack,
  id: string,
  type: StateMachineType
): StateMachine =>
  new StateMachine(stack, id, {
    stateMachineType: type,
    definitionBody: DefinitionBody.fromChainable(new Pass(stack, `${id}Pass`)),
  });

describe("StepFunctionsDefaultsAspect", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack");
    Aspects.of(stack).add(new StepFunctionsDefaultsAspect());
  });

  afterEach(() => {
    app = undefined as unknown as App;
    stack = undefined as unknown as Stack;
  });

  describe("X-Ray tracing", () => {
    it("enables tracing on STANDARD state machines", () => {
      makeStateMachine(stack, "StandardSM", StateMachineType.STANDARD);
      app.synth();

      Template.fromStack(stack).hasResourceProperties(
        "AWS::StepFunctions::StateMachine",
        { TracingConfiguration: { Enabled: true } }
      );
    });

    it("enables tracing on EXPRESS state machines", () => {
      makeStateMachine(stack, "ExpressSM", StateMachineType.EXPRESS);
      app.synth();

      Template.fromStack(stack).hasResourceProperties(
        "AWS::StepFunctions::StateMachine",
        { TracingConfiguration: { Enabled: true } }
      );
    });
  });

  describe("CloudWatch logging for EXPRESS machines", () => {
    it("creates a log group and configures logging", () => {
      makeStateMachine(stack, "ExpressSM", StateMachineType.EXPRESS);
      app.synth();

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "/aws/vendedlogs/states/ExpressSM",
      });

      template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
        LoggingConfiguration: {
          Level: "ALL",
          IncludeExecutionData: true,
          Destinations: Match.arrayWith([
            Match.objectLike({
              CloudWatchLogsLogGroup: {
                LogGroupArn: Match.anyValue(),
              },
            }),
          ]),
        },
      });
    });

    it("attaches CloudWatch Logs delivery permissions to the state machine role", () => {
      makeStateMachine(stack, "ExpressSM", StateMachineType.EXPRESS);
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "logs:CreateLogDelivery",
                "logs:GetLogDelivery",
                "logs:UpdateLogDelivery",
                "logs:DeleteLogDelivery",
                "logs:ListLogDeliveries",
                "logs:PutResourcePolicy",
                "logs:DescribeResourcePolicies",
                "logs:DescribeLogGroups",
              ]),
              Resource: "*",
            }),
          ]),
        },
      });
    });

    it("does not configure logging for STANDARD state machines", () => {
      makeStateMachine(stack, "StandardSM", StateMachineType.STANDARD);
      app.synth();

      const template = Template.fromStack(stack);

      const machines = template.findResources(
        "AWS::StepFunctions::StateMachine"
      );
      const props = Object.values(machines)[0].Properties;
      expect(props.LoggingConfiguration).toBeUndefined();
    });

    it("does not override an existing logging configuration", () => {
      const sm = makeStateMachine(stack, "ExpressSM", StateMachineType.EXPRESS);
      const cfnSm = sm.node
        .defaultChild as import("aws-cdk-lib/aws-stepfunctions").CfnStateMachine;
      cfnSm.loggingConfiguration = {
        level: "ERROR",
        includeExecutionData: false,
        destinations: [],
      };

      app.synth();

      Template.fromStack(stack).hasResourceProperties(
        "AWS::StepFunctions::StateMachine",
        {
          LoggingConfiguration: Match.objectLike({ Level: "ERROR" }),
        }
      );
    });
  });
});
