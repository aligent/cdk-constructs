import {
  App,
  Aspects,
  CfnResource,
  Fn,
  Lazy,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { CfnApplication } from "aws-cdk-lib/aws-appconfig";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { CfnLogGroup, LogGroup } from "aws-cdk-lib/aws-logs";
import { Bucket, CfnBucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { CfnTopic } from "aws-cdk-lib/aws-sns";
import { CfnQueue } from "aws-cdk-lib/aws-sqs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { createHash } from "crypto";
import { ResourcePrefixAspect } from "./resource-prefix";

describe("ResourcePrefixAspect", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack");
    Aspects.of(stack).add(
      new ResourcePrefixAspect({
        prefix: "myapp",
        exclude: ["AWS::AppConfig::Application"],
      })
    );
  });

  afterEach(() => {
    app = undefined as unknown as App;
    stack = undefined as unknown as Stack;
  });

  describe("constructor", () => {
    it("should throw error if prefix is invalid", () => {
      expect(() => new ResourcePrefixAspect({ prefix: "invalid!" })).toThrow(
        `ResourcePrefixAspect: prefix must contain only lowercase alphanumeric characters and hyphens, got "invalid!"`
      );
    });

    it("should instantiate with valid prefix", () => {
      const aspect = new ResourcePrefixAspect({ prefix: "test" });
      expect(aspect).toBeInstanceOf(ResourcePrefixAspect);
    });

    it("should instantiate with exclude list", () => {
      const aspect = new ResourcePrefixAspect({
        prefix: "test",
        exclude: ["AWS::IAM::Role"],
      });
      expect(aspect).toBeInstanceOf(ResourcePrefixAspect);
    });
  });

  describe("basic prefixing", () => {
    it("should prefix Lambda function names", () => {
      new CfnFunction(stack, "OrdersFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "myapp-OrdersFunction",
      });
    });

    it("should prefix S3 bucket names and convert to lowercase", () => {
      new CfnBucket(stack, "AssetsBucket", {});

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "myapp-assetsbucket",
      });
    });

    it("should prefix DynamoDB table names", () => {
      new Table(stack, "UsersTable", {
        partitionKey: { name: "id", type: AttributeType.STRING },
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: Match.stringLikeRegexp("^myapp-"),
      });
    });

    it("should prefix SQS queue names", () => {
      new CfnQueue(stack, "OrdersQueue", {});

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "myapp-OrdersQueue",
      });
    });

    it("should prefix SNS topic names", () => {
      new CfnTopic(stack, "NotificationsTopic", {});

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SNS::Topic", {
        TopicName: "myapp-NotificationsTopic",
      });
    });

    it("should prefix IAM role names", () => {
      new Role(stack, "ExecutionRole", {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: Match.stringLikeRegexp("^myapp-"),
      });
    });
  });

  describe("special cases", () => {
    it("should append .fifo to FIFO queue names", () => {
      new CfnQueue(stack, "MyFifoQueue", {
        fifoQueue: true,
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SQS::Queue", {
        QueueName: "myapp-MyFifoQueue.fifo",
      });
    });

    it("should append .fifo to FIFO topic names", () => {
      new CfnTopic(stack, "MyFifoTopic", {
        fifoTopic: true,
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SNS::Topic", {
        TopicName: "myapp-MyFifoTopic.fifo",
      });
    });

    it("should prefix SSM parameter names with path-style format", () => {
      new StringParameter(stack, "MyParam", {
        stringValue: "test-value",
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: Match.stringLikeRegexp("^/myapp/"),
      });
    });

    it("should sanitize logical IDs by replacing non-alphanumeric with dashes", () => {
      new CfnFunction(stack, "Orders_Processing__Function", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();
      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Lambda::Function");
      const functionName = Object.values(resources)[0].Properties
        .FunctionName as string;
      expect(functionName).toBe("myapp-OrdersProcessingFunction");
    });
  });

  describe("skip rules", () => {
    it("should skip log groups with AWS-managed /aws/ prefix", () => {
      new LogGroup(stack, "LambdaLogGroup", {
        logGroupName: "/aws/lambda/my-function",
      });

      app.synth();
      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Logs::LogGroup");
      const logGroupName = Object.values(resources)[0].Properties
        .LogGroupName as string;
      expect(logGroupName).toBe("/aws/lambda/my-function");
    });

    it("should prefix log groups with custom names", () => {
      new LogGroup(stack, "AppLogGroup", { logGroupName: "my-app-logs" });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "myapp-my-app-logs",
      });
    });

    it("should prefix log groups without an explicit name", () => {
      new CfnLogGroup(stack, "DefaultLogGroup", {});

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.stringLikeRegexp("^myapp-"),
      });
    });
  });

  describe("CDK-managed singletons", () => {
    // BucketDeployment provisions a framework-owned singleton handler Lambda whose
    // physical name the consumer cannot tune. Pinning a deterministic name onto it
    // breaks CloudFormation's random-suffix orphan-avoidance for the /aws/lambda
    // LogGroup the Lambda service auto-creates.
    const synthWithBucketDeployment = () => {
      const bundlingApp = new App({
        context: { "aws:cdk:bundling-stacks": [] },
      });
      const bundlingStack = new Stack(bundlingApp, "TestStack");
      Aspects.of(bundlingStack).add(
        new ResourcePrefixAspect({ prefix: "myapp" })
      );

      const bucket = new Bucket(bundlingStack, "DeployBucket");
      new BucketDeployment(bundlingStack, "DeployAssets", {
        destinationBucket: bucket,
        sources: [Source.data("hello.txt", "hello world")],
      });

      bundlingApp.synth();
      return bundlingStack;
    };

    const findSingletonHandler = (stackToSearch: Stack) => {
      const handler = stackToSearch.node
        .findAll()
        .find(
          c =>
            c instanceof CfnFunction &&
            c.node.path.includes("Custom::CDKBucketDeployment")
        ) as CfnFunction | undefined;
      if (!handler) {
        throw new Error(
          "BucketDeployment singleton handler not found — test setup invariant changed"
        );
      }
      return handler;
    };

    it("should not assign an explicit name to the BucketDeployment handler lambda", () => {
      const synthStack = synthWithBucketDeployment();
      const handler = findSingletonHandler(synthStack);
      const logicalId = synthStack.getLogicalId(handler);

      const template = Template.fromStack(synthStack);
      const resources = template.findResources("AWS::Lambda::Function");
      expect(resources[logicalId].Properties?.FunctionName).toBeUndefined();
    });

    it("should not assign an explicit name to the BucketDeployment handler service role", () => {
      // The singleton handler's IAM role is nested under the same path. A
      // deterministic, logical-id-derived RoleName is identical across every
      // stack in a prefix scope, and IAM role names are account-global — so two
      // BucketDeployment-using stacks in the same stage collide on it.
      const synthStack = synthWithBucketDeployment();
      const role = synthStack.node
        .findAll()
        .find(
          (c): c is CfnResource =>
            c instanceof CfnResource &&
            c.cfnResourceType === "AWS::IAM::Role" &&
            c.node.path.includes("Custom::CDKBucketDeployment")
        );
      expect(role).toBeDefined();
      const logicalId = synthStack.getLogicalId(role as CfnResource);

      const template = Template.fromStack(synthStack);
      const resources = template.findResources("AWS::IAM::Role");
      expect(resources[logicalId].Properties?.RoleName).toBeUndefined();
    });

    it("should not assign an explicit name to the S3AutoDeleteObjects handler lambda", () => {
      new Bucket(stack, "EphemeralBucket", {
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      app.synth();

      // The autoDeleteObjects handler is provisioned via CustomResourceProvider
      // as a raw CfnResource (not a CfnFunction L1 instance).
      const handler = stack.node
        .findAll()
        .find(
          (c): c is CfnResource =>
            c instanceof CfnResource &&
            c.cfnResourceType === "AWS::Lambda::Function" &&
            c.node.path.includes("Custom::S3AutoDeleteObjects")
        );
      expect(handler).toBeDefined();
      const logicalId = stack.getLogicalId(handler as CfnResource);

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Lambda::Function");
      expect(resources[logicalId].Properties?.FunctionName).toBeUndefined();
    });
  });

  describe("token handling", () => {
    it("should fall back to logical name when resource name is a CDK token", () => {
      new CfnFunction(stack, "TokenFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
        functionName: Fn.ref("SomeParameter"),
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "myapp-TokenFunction",
      });
    });

    it("should fall back to logical name when resource name is a Lazy token string", () => {
      new CfnFunction(stack, "LazyTokenFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
        functionName: Lazy.string({ produce: () => "resolved-later" }),
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "myapp-LazyTokenFunction",
      });
    });
  });

  describe("exclusion", () => {
    it("should not prefix excluded resource types", () => {
      new CfnApplication(stack, "MyApp", {
        name: "my-application",
      });

      app.synth();
      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::AppConfig::Application");
      const properties = Object.values(resources)[0].Properties;
      expect(properties.Name).toBe("my-application");
    });

    it("should prefix non-excluded resources when exclusions are specified", () => {
      new CfnFunction(stack, "OrdersFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "myapp-OrdersFunction",
      });
    });
  });

  describe("idempotency", () => {
    it("should not re-prefix already prefixed resources", () => {
      new CfnFunction(stack, "myapp-OrdersFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();
      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Lambda::Function");
      const functionName = Object.values(resources)[0].Properties
        .FunctionName as string;
      expect(functionName).toMatch(/^myapp-/);
    });
  });

  describe("truncation", () => {
    // Lambda maxLength = 64. With prefix "myapp-" (6 chars), the construct ID must be
    // > 58 chars so the prefixed name exceeds the limit. Using logical ID (construct ID)
    // as the name source avoids relying on CDK's internal _cfnProperties API.
    const longLambdaId =
      "FunctionWithAVeryLongNameThatWillExceedTheLimitOfSixtyFourChars"; // 63 chars → prefixed = 69

    it("should truncate a Lambda name that exceeds 64 chars and emit a warning", () => {
      new CfnFunction(stack, longLambdaId, {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Lambda::Function");
      const functionName = Object.values(resources)[0].Properties
        .FunctionName as string;

      expect(functionName.length).toBeLessThanOrEqual(64);
      expect(functionName).toMatch(/^myapp-/);
      expect(functionName).toMatch(/-[0-9a-f]{8}$/);

      Annotations.fromStack(stack).hasWarning(
        `/TestStack/${longLambdaId}`,
        Match.stringLikeRegexp("\\[ResourcePrefixAspect\\].*truncated.*")
      );
    });

    it("should produce a deterministic truncated name", () => {
      const fullName = `myapp-${longLambdaId}`;
      const hash = createHash("sha256")
        .update(fullName)
        .digest("hex")
        .slice(0, 8);
      const budget = 64 - 8 - 1; // maxLength - hash length - dash separator
      const expected = fullName.slice(0, budget) + "-" + hash;

      new CfnFunction(stack, longLambdaId, {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::Lambda::Function");
      const functionName = Object.values(resources)[0].Properties
        .FunctionName as string;

      expect(functionName).toBe(expected);
    });

    it("should truncate a long FIFO queue name and preserve the .fifo suffix", () => {
      // SQS maxLength = 80. With "myapp-" (6) + id + ".fifo" (5), id must be > 69 chars.
      const longFifoId =
        "FifoQueueWithAVeryLongNameThatWillExceedTheEightyCharLimitForSqsQueues"; // 70 chars → prefixed+.fifo = 81

      new CfnQueue(stack, longFifoId, { fifoQueue: true });

      app.synth();

      const template = Template.fromStack(stack);
      const resources = template.findResources("AWS::SQS::Queue");
      const queueName = Object.values(resources)[0].Properties
        .QueueName as string;

      expect(queueName.length).toBeLessThanOrEqual(80);
      expect(queueName).toMatch(/^myapp-/);
      expect(queueName).toMatch(/\.fifo$/);

      Annotations.fromStack(stack).hasWarning(
        `/TestStack/${longFifoId}`,
        Match.stringLikeRegexp("\\[ResourcePrefixAspect\\].*truncated.*")
      );
    });

    it("should not truncate names that are within the limit", () => {
      new CfnFunction(stack, "ShortFunction", {
        runtime: "nodejs22.x",
        handler: "index.handler",
        code: { zipFile: "exports.handler = () => {};" },
        role: "arn:aws:iam::123456789012:role/test",
      });

      app.synth();

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "myapp-ShortFunction",
      });

      Annotations.fromStack(stack).hasNoWarning(
        "/TestStack/ShortFunction",
        Match.stringLikeRegexp(".*truncated.*")
      );
    });
  });
});
