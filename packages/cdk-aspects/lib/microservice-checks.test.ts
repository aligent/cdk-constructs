import {
  App,
  AspectPriority,
  Aspects,
  Aws,
  Fn,
  NestedStack,
  Stack,
  Tags,
} from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { CfnRestApi, RestApi } from "aws-cdk-lib/aws-apigateway";
import { CfnApi } from "aws-cdk-lib/aws-apigatewayv2";
import {
  AttributeType,
  CfnTable,
  Table,
  TableV2,
} from "aws-cdk-lib/aws-dynamodb";
import { CfnRule } from "aws-cdk-lib/aws-events";
import { CfnKey } from "aws-cdk-lib/aws-kms";
import { CfnFunction, Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import { Bucket, CfnBucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { CfnSchedule } from "aws-cdk-lib/aws-scheduler";
import { CfnSecret } from "aws-cdk-lib/aws-secretsmanager";
import { CfnTopic, Topic } from "aws-cdk-lib/aws-sns";
import { CfnQueue, Queue } from "aws-cdk-lib/aws-sqs";
import { CfnParameter as SsmCfnParameter } from "aws-cdk-lib/aws-ssm";
import {
  CfnStateMachine,
  DefinitionBody,
  Pass,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { NagMessageLevel, NagSuppressions } from "cdk-nag";
import type { Construct } from "constructs";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MicroserviceChecks } from "./microservice-checks";

const RESOURCE_DESCRIPTION = Match.stringLikeRegexp(
  "Microservices-ResourceDescription"
);
const STACK_DESCRIPTION = Match.stringLikeRegexp(
  "Microservices-StackDescription"
);

/**
 * READONLY priority mirrors the README usage, so tags added via `Tags.of` are visible to the checks.
 */
function createStack(
  options: {
    description?: string;
    level?: NagMessageLevel.ERROR | NagMessageLevel.WARN;
  } = {}
): Stack {
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new Stack(app, "TestStack", {
    description: options.description ?? "Test stack",
  });
  Aspects.of(stack).add(
    new MicroserviceChecks({
      stageName: "dev",
      resourceDescriptionLevel: options.level,
    }),
    { priority: AspectPriority.READONLY }
  );
  return stack;
}

function createFunction(
  scope: Construct,
  id: string,
  description?: string
): Function {
  return new Function(scope, id, {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = () => {};"),
    description,
  });
}

describe("MicroserviceChecks", () => {
  it("should have the correct pack name", () => {
    const checks = new MicroserviceChecks({ stageName: "dev" });

    expect(checks.readPackName).toBe("Microservices");
  });

  it("should instantiate with props", () => {
    const checks = new MicroserviceChecks({ stageName: "dev", verbose: true });

    expect(checks).toBeInstanceOf(MicroserviceChecks);
  });

  it("should have a visit method", () => {
    const checks = new MicroserviceChecks({ stageName: "dev" });

    expect(typeof checks.visit).toBe("function");
  });

  describe("stageName validation", () => {
    it("should accept a valid 3-char lowercase alphanumeric stageName", () => {
      expect(() => new MicroserviceChecks({ stageName: "dev" })).not.toThrow();
      expect(() => new MicroserviceChecks({ stageName: "stg" })).not.toThrow();
      expect(() => new MicroserviceChecks({ stageName: "prd" })).not.toThrow();
      expect(() => new MicroserviceChecks({ stageName: "ab1" })).not.toThrow();
    });

    it("should throw for a stageName that is too short", () => {
      expect(() => new MicroserviceChecks({ stageName: "de" })).toThrow(
        "stageName must be exactly 3 lowercase alphanumeric characters"
      );
    });

    it("should throw for a stageName that is too long", () => {
      expect(() => new MicroserviceChecks({ stageName: "devv" })).toThrow(
        "stageName must be exactly 3 lowercase alphanumeric characters"
      );
    });

    it("should throw for a stageName with uppercase characters", () => {
      expect(() => new MicroserviceChecks({ stageName: "DEV" })).toThrow(
        "stageName must be exactly 3 lowercase alphanumeric characters"
      );
    });

    it("should throw for a stageName with special characters", () => {
      expect(() => new MicroserviceChecks({ stageName: "d-v" })).toThrow(
        "stageName must be exactly 3 lowercase alphanumeric characters"
      );
    });
  });

  describe("visit", () => {
    let annotations: Annotations;

    beforeAll(() => {
      const app = new App({
        context: {
          "aws:cdk:bundling-stacks": [],
        },
      });
      const stack = new Stack(app, "TestStack");
      const checks = new MicroserviceChecks({ stageName: "dev" });
      Aspects.of(stack).add(checks);

      new Function(stack, "TestFunction", {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = () => {};"),
      });

      new LogGroup(stack, "TestLogGroup", {
        logGroupName: "TestLogGroup",
        // The LogGroup construct defaults to 731 day retention, actually have to explicitly
        // use RetentionDays.INFINITE to get a resource with no retention set
        retention: RetentionDays.INFINITE,
      });

      // Act
      annotations = Annotations.fromStack(stack);
    });

    it("should trigger a rule if the lambda does not have an explicit memory value configured", () => {
      annotations.hasError(
        "/TestStack/TestFunction/Resource",
        Match.stringLikeRegexp(
          "does not have an explicit memory value configured"
        )
      );
    });

    it("should trigger a rule if the lambda does not have an explicit timeout value configured", () => {
      annotations.hasError(
        "/TestStack/TestFunction/Resource",
        Match.stringLikeRegexp(
          "does not have an explicitly defined timeout value"
        )
      );
    });

    it("should trigger a rule if the lambda does not have tracing set to active", () => {
      annotations.hasError(
        "/TestStack/TestFunction/Resource",
        Match.stringLikeRegexp("does not have tracing set to Tracing.ACTIVE")
      );
    });

    it("should trigger a rule if the cloudwatch log group does not have an explicit retention policy", () => {
      annotations.hasError(
        "/TestStack/TestLogGroup/Resource",
        Match.stringLikeRegexp("does not have an explicit retention policy")
      );
    });
  });

  describe("API Gateway stage name rule", () => {
    it("should trigger an error when stageName does not match", () => {
      const app = new App();
      const stack = new Stack(app, "TestStack");
      Aspects.of(stack).add(new MicroserviceChecks({ stageName: "prd" }));

      const api = new RestApi(stack, "TestApi", {
        deployOptions: { stageName: "dev" },
      });
      api.root.addMethod("GET");

      const annotations = Annotations.fromStack(stack);
      annotations.hasError(
        "/TestStack/TestApi/DeploymentStage.dev/Resource",
        Match.stringLikeRegexp(
          "Microservices-ApiGatewayStageName: .*does not have a valid stageName configured"
        )
      );
    });

    it("should not trigger an error when stageName matches", () => {
      const app = new App();
      const stack = new Stack(app, "TestStack");
      Aspects.of(stack).add(new MicroserviceChecks({ stageName: "prd" }));

      const api = new RestApi(stack, "TestApi", {
        deployOptions: { stageName: "prd" },
      });
      api.root.addMethod("GET");

      const annotations = Annotations.fromStack(stack);
      annotations.hasNoError(
        "/TestStack/TestApi/DeploymentStage.prd/Resource",
        Match.stringLikeRegexp("Microservices-ApiGatewayStageName")
      );
    });
  });

  describe("CDK-managed singletons", () => {
    let annotations: Annotations;
    let bucketDeploymentPath: string;

    beforeAll(() => {
      const app = new App({
        context: {
          "aws:cdk:bundling-stacks": [],
        },
      });
      const stack = new Stack(app, "TestStack");
      Aspects.of(stack).add(new MicroserviceChecks({ stageName: "dev" }));

      const bucket = new Bucket(stack, "DeployBucket");
      new BucketDeployment(stack, "DeployAssets", {
        destinationBucket: bucket,
        sources: [Source.data("hello.txt", "hello world")],
      });

      const singleton = stack.node
        .findAll()
        .find(c => c.node.id.startsWith("Custom::CDKBucketDeployment"));
      if (!singleton) {
        throw new Error(
          "BucketDeployment singleton not found — test setup invariant changed"
        );
      }
      bucketDeploymentPath = singleton.node.path;

      annotations = Annotations.fromStack(stack);
    });

    it("should not nag the BucketDeployment singleton lambda for memory size", () => {
      annotations.hasNoError(
        `/${bucketDeploymentPath}/Resource`,
        Match.stringLikeRegexp(
          "does not have an explicit memory value configured"
        )
      );
    });

    it("should not nag the BucketDeployment singleton lambda for timeout", () => {
      annotations.hasNoError(
        `/${bucketDeploymentPath}/Resource`,
        Match.stringLikeRegexp(
          "does not have an explicitly defined timeout value"
        )
      );
    });

    it("should not nag the BucketDeployment singleton lambda for tracing", () => {
      annotations.hasNoError(
        `/${bucketDeploymentPath}/Resource`,
        Match.stringLikeRegexp("does not have tracing set to Tracing.ACTIVE")
      );
    });

    it("should not nag the BucketDeployment singleton lambda for description", () => {
      annotations.hasNoError(
        `/${bucketDeploymentPath}/Resource`,
        RESOURCE_DESCRIPTION
      );
    });
  });

  describe("resourceDescriptionLevel validation", () => {
    it("should throw for a level other than ERROR or WARN", () => {
      expect(
        () =>
          new MicroserviceChecks({
            stageName: "dev",
            resourceDescriptionLevel:
              NagMessageLevel.INFO as unknown as NagMessageLevel.WARN,
          })
      ).toThrow(
        "resourceDescriptionLevel must be NagMessageLevel.ERROR or NagMessageLevel.WARN"
      );
    });
  });

  describe("Resource description rule", () => {
    describe.each<[string, (scope: Stack, description?: string) => void]>([
      [
        "CfnFunction",
        (scope, description) =>
          new CfnFunction(scope, "Target", {
            code: { zipFile: "exports.handler = () => {};" },
            role: "arn:aws:iam::123456789012:role/test",
            description,
          }),
      ],
      [
        "CfnRestApi",
        (scope, description) =>
          new CfnRestApi(scope, "Target", { name: "api", description }),
      ],
      [
        "CfnApi",
        (scope, description) =>
          new CfnApi(scope, "Target", {
            name: "api",
            protocolType: "HTTP",
            description,
          }),
      ],
      [
        "CfnRule",
        (scope, description) =>
          new CfnRule(scope, "Target", {
            scheduleExpression: "rate(1 day)",
            description,
          }),
      ],
      [
        "CfnSchedule",
        (scope, description) =>
          new CfnSchedule(scope, "Target", {
            flexibleTimeWindow: { mode: "OFF" },
            scheduleExpression: "rate(1 day)",
            target: {
              arn: "arn:aws:sqs:ap-southeast-2:123456789012:queue",
              roleArn: "arn:aws:iam::123456789012:role/test",
            },
            description,
          }),
      ],
      [
        "CfnPipe",
        (scope, description) =>
          new CfnPipe(scope, "Target", {
            roleArn: "arn:aws:iam::123456789012:role/test",
            source: "arn:aws:sqs:ap-southeast-2:123456789012:source",
            target: "arn:aws:sqs:ap-southeast-2:123456789012:target",
            description,
          }),
      ],
      [
        "SSM CfnParameter",
        (scope, description) =>
          new SsmCfnParameter(scope, "Target", {
            type: "String",
            value: "value",
            description,
          }),
      ],
      [
        "CfnSecret",
        (scope, description) => new CfnSecret(scope, "Target", { description }),
      ],
      [
        "CfnKey",
        (scope, description) => new CfnKey(scope, "Target", { description }),
      ],
    ])("%s", (_name, create) => {
      it("should trigger an error when the description is missing", () => {
        const stack = createStack();
        create(stack);

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target",
          RESOURCE_DESCRIPTION
        );
      });

      it("should not trigger an error when the description is set", () => {
        const stack = createStack();
        create(stack, "Handles orders");

        Annotations.fromStack(stack).hasNoError(
          "/TestStack/Target",
          RESOURCE_DESCRIPTION
        );
      });
    });

    it.each(["", "   "])(
      "should trigger an error for a blank description (%j)",
      description => {
        const stack = createStack();
        createFunction(stack, "Target", description);

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      }
    );

    it("should treat a description built from tokens as compliant", () => {
      const stack = createStack();
      createFunction(stack, "Target", `${Aws.STACK_NAME} handler`);

      const annotations = Annotations.fromStack(stack);
      annotations.hasNoError(
        "/TestStack/Target/Resource",
        RESOURCE_DESCRIPTION
      );
      annotations.hasNoError(
        "/TestStack/Target/Resource",
        Match.stringLikeRegexp("CdkNagValidationFailure")
      );
    });

    it("should not accept a Description tag on types with a native description", () => {
      const stack = createStack();
      const fn = createFunction(stack, "Target");
      Tags.of(fn).add("Description", "Handles orders");

      Annotations.fromStack(stack).hasError(
        "/TestStack/Target/Resource",
        RESOURCE_DESCRIPTION
      );
    });

    describe.each<[string, (scope: Stack) => Construct]>([
      ["Bucket", scope => new Bucket(scope, "Target")],
      [
        "Table",
        scope =>
          new Table(scope, "Target", {
            partitionKey: { name: "pk", type: AttributeType.STRING },
          }),
      ],
      ["Queue", scope => new Queue(scope, "Target")],
      ["Topic", scope => new Topic(scope, "Target")],
    ])("%s", (_name, create) => {
      it("should trigger an error when the Description tag is missing", () => {
        const stack = createStack();
        create(stack);

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });

      it("should not trigger an error when tagged via Tags.of", () => {
        const stack = createStack();
        Tags.of(create(stack)).add("Description", "Order events");

        Annotations.fromStack(stack).hasNoError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });
    });

    it.each<[string, (scope: Stack) => void]>([
      [
        "CfnBucket",
        scope =>
          new CfnBucket(scope, "Target", {
            tags: [{ key: "Description", value: "Order exports" }],
          }),
      ],
      [
        "CfnTable",
        scope =>
          new CfnTable(scope, "Target", {
            keySchema: [{ attributeName: "pk", keyType: "HASH" }],
            attributeDefinitions: [{ attributeName: "pk", attributeType: "S" }],
            billingMode: "PAY_PER_REQUEST",
            tags: [{ key: "Description", value: "Orders" }],
          }),
      ],
      [
        "CfnQueue",
        scope =>
          new CfnQueue(scope, "Target", {
            tags: [{ key: "Description", value: "Order jobs" }],
          }),
      ],
      [
        "CfnTopic",
        scope =>
          new CfnTopic(scope, "Target", {
            tags: [{ key: "Description", value: "Order events" }],
          }),
      ],
    ])("should accept a Description tag set via %s props", (_name, create) => {
      const stack = createStack();
      create(stack);

      Annotations.fromStack(stack).hasNoError(
        "/TestStack/Target",
        RESOURCE_DESCRIPTION
      );
    });

    describe("state machine", () => {
      let aslPath: string;

      beforeAll(() => {
        aslPath = join(
          mkdtempSync(join(tmpdir(), "microservice-checks-")),
          "state-machine.asl.json"
        );
        writeFileSync(
          aslPath,
          JSON.stringify({
            StartAt: "Done",
            States: { Done: { Type: "Pass", End: true } },
          })
        );
      });

      it("should accept a top-level comment in a tokenised definition", () => {
        const stack = createStack();
        const invoke = new LambdaInvoke(stack, "Invoke", {
          lambdaFunction: createFunction(stack, "Handler", "Handles orders"),
        });
        new StateMachine(stack, "Target", {
          comment: "Processes orders",
          definitionBody: DefinitionBody.fromChainable(invoke),
        });

        Annotations.fromStack(stack).hasNoError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });

      it("should ignore state-level comments", () => {
        const stack = createStack();
        new StateMachine(stack, "Target", {
          definitionBody: DefinitionBody.fromChainable(
            new Pass(stack, "Step", { comment: "Describes the step" })
          ),
        });

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });

      it("should trigger an error for a file definition", () => {
        const stack = createStack();
        new StateMachine(stack, "Target", {
          definitionBody: DefinitionBody.fromFile(aslPath),
        });

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });

      it("should not accept a Description tag", () => {
        const stack = createStack();
        const stateMachine = new StateMachine(stack, "Target", {
          definitionBody: DefinitionBody.fromFile(aslPath),
        });
        Tags.of(stateMachine).add("Description", "Processes orders");

        Annotations.fromStack(stack).hasError(
          "/TestStack/Target/Resource",
          RESOURCE_DESCRIPTION
        );
      });

      it("should accept a top-level Comment in an L1 definition object", () => {
        const stack = createStack();
        new CfnStateMachine(stack, "Target", {
          roleArn: "arn:aws:iam::123456789012:role/test",
          definition: {
            Comment: "Processes orders",
            StartAt: "Done",
            States: { Done: { Type: "Pass", End: true } },
          },
        });

        Annotations.fromStack(stack).hasNoError(
          "/TestStack/Target",
          RESOURCE_DESCRIPTION
        );
      });

      it("should treat an unparseable definition as compliant", () => {
        const stack = createStack();
        new CfnStateMachine(stack, "Target", {
          roleArn: "arn:aws:iam::123456789012:role/test",
          definitionString: Fn.importValue("SharedDefinition"),
        });

        Annotations.fromStack(stack).hasNoError(
          "/TestStack/Target",
          RESOURCE_DESCRIPTION
        );
      });
    });

    it("should not apply to resource types outside the allowlist", () => {
      const stack = createStack();
      createFunction(stack, "Target", "Handles orders");
      new TableV2(stack, "Table", {
        partitionKey: { name: "pk", type: AttributeType.STRING },
      });

      const annotations = Annotations.fromStack(stack);
      annotations.hasNoError(
        "/TestStack/Target/ServiceRole/Resource",
        RESOURCE_DESCRIPTION
      );
      annotations.hasNoError("/TestStack/Table/Resource", RESOURCE_DESCRIPTION);
    });

    it("should honour NagSuppressions", () => {
      const stack = createStack();
      const fn = createFunction(stack, "Target");
      NagSuppressions.addResourceSuppressions(
        fn,
        [
          {
            id: "Microservices-ResourceDescription",
            reason: "Owned by a third-party construct",
          },
        ],
        true
      );

      Annotations.fromStack(stack).hasNoError(
        "/TestStack/Target/Resource",
        RESOURCE_DESCRIPTION
      );
    });

    it("should report a warning when resourceDescriptionLevel is WARN", () => {
      const stack = createStack({ level: NagMessageLevel.WARN });
      createFunction(stack, "Target");

      const annotations = Annotations.fromStack(stack);
      annotations.hasWarning(
        "/TestStack/Target/Resource",
        RESOURCE_DESCRIPTION
      );
      annotations.hasNoError(
        "/TestStack/Target/Resource",
        RESOURCE_DESCRIPTION
      );
    });
  });

  describe("Stack description check", () => {
    it("should trigger an error when the stack has no description", () => {
      const stack = createStack({ description: "  " });

      Annotations.fromStack(stack).hasError("/TestStack", STACK_DESCRIPTION);
    });

    it("should not trigger an error when the stack has a description", () => {
      const stack = createStack();

      Annotations.fromStack(stack).hasNoError("/TestStack", STACK_DESCRIPTION);
    });

    it("should honour NagSuppressions.addStackSuppressions", () => {
      const stack = createStack({ description: "  " });
      NagSuppressions.addStackSuppressions(stack, [
        {
          id: "Microservices-StackDescription",
          reason: "CDK-generated support stack",
        },
      ]);

      Annotations.fromStack(stack).hasNoError("/TestStack", STACK_DESCRIPTION);
    });

    it("should trigger an error for a nested stack without a description", () => {
      const stack = createStack();
      new NestedStack(stack, "Nested");

      Annotations.fromStack(stack).hasError(
        "/TestStack/Nested",
        STACK_DESCRIPTION
      );
    });

    it("should stay an error when resourceDescriptionLevel is WARN", () => {
      const stack = createStack({
        description: "  ",
        level: NagMessageLevel.WARN,
      });

      Annotations.fromStack(stack).hasError("/TestStack", STACK_DESCRIPTION);
    });
  });
});
