import { App, Aspects, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { CfnBucket } from "aws-cdk-lib/aws-s3";
import { CfnTopic } from "aws-cdk-lib/aws-sns";
import { CfnQueue } from "aws-cdk-lib/aws-sqs";
import { CfnApplication } from "aws-cdk-lib/aws-appconfig";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
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
});
