import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

import { StepFunctionFromFile } from "./step-function-from-file-construct";

const snapshotMessage =
  "Rerun tests with the -u flag to update snapshots if changes are expected";

// The test __dirname lives under packages/constructs/step-function-from-file/lib,
// so "constructs" is the parent-of-parent dir name we can use as rootParentDir.
const ROOT_PARENT_DIR = "constructs";

describe("StepFunctionFromFile", () => {
  let stack: Stack;

  beforeEach(() => {
    stack = new Stack();
    new StepFunctionFromFile<"__data__/">(stack, "MyStateMachine", {
      filepath: "__data__/test-machine.asl.yaml",
      baseDir: __dirname,
      rootParentDir: ROOT_PARENT_DIR,
    });
  });

  test("creates a state machine from a file", () => {
    const template = Template.fromStack(stack);

    const stateMachines = template.findResources(
      "AWS::StepFunctions::StateMachine"
    );
    expect(stateMachines).toMatchSnapshot(snapshotMessage);
  });

  test("creates a state machine with lambda functions", () => {
    // Create test lambda functions
    const lambda = new NodejsFunction(stack, "TestFunction", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromInline(
        "exports.handler = async () => ({ statusCode: 200 });"
      ),
    });

    const otherLambda = new NodejsFunction(stack, "OtherTestFunction", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromInline(
        "exports.handler = async () => ({ statusCode: 200 });"
      ),
    });

    new StepFunctionFromFile<"__data__/">(stack, "LambdaStateMachine", {
      filepath: "__data__/test-machine.asl.yaml",
      baseDir: __dirname,
      rootParentDir: ROOT_PARENT_DIR,
      lambdaFunctions: [lambda, otherLambda],
      definitionSubstitutions: {
        ExtraParam: "ExtraValue",
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
      DefinitionSubstitutions: {
        ExtraParam: "ExtraValue",
        TestFunction: {
          "Fn::GetAtt": [Match.stringLikeRegexp("TestFunction.*"), "Arn"],
        },
        OtherTestFunction: {
          "Fn::GetAtt": [Match.stringLikeRegexp("OtherTestFunction.*"), "Arn"],
        },
      },
    });

    // Check that IAM policies grant invoke permissions (there should be 2 policies, one for each lambda)
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "lambda:InvokeFunction",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("throws when filepath resolves outside the allowed root", () => {
    expect(() => {
      new StepFunctionFromFile<"__data__/">(stack, "BadPath", {
        filepath: "__data__/../../../../../../etc/passwd" as `__data__/${string}`,
        baseDir: __dirname,
        rootParentDir: ROOT_PARENT_DIR,
      });
    }).toThrow(/Path traversal detected/);
  });

  test("throws when no matching rootParentDir ancestor exists", () => {
    expect(() => {
      new StepFunctionFromFile<"__data__/">(stack, "NoRoot", {
        filepath: "__data__/test-machine.asl.yaml",
        baseDir: __dirname,
        rootParentDir: "nonexistent-parent",
      });
    }).toThrow(/Could not find a 'nonexistent-parent\/<name>' ancestor/);
  });
});
