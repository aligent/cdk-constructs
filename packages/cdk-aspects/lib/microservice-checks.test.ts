import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match } from "aws-cdk-lib/assertions";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { MicroserviceChecks } from "./microservice-checks";

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
        Match.stringLikeRegexp("does not have a valid stageName configured")
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
        Match.stringLikeRegexp("does not have a valid stageName configured")
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
  });
});
