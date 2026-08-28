import { App, Aspects, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { LambdaAndStepFunctionVersioningAspect } from "./lambda-sfn-versioning";

describe("LambdaAndStepFunctionVersioningAspect", () => {
  describe("CDK-managed singletons", () => {
    // BucketDeployment provisions a framework-owned singleton handler Lambda that
    // the consumer cannot reference. Versioning it creates aliases nobody can use
    // and that the consumer does not own.
    const synthWithBucketDeployment = () => {
      const bundlingApp = new App({
        context: { "aws:cdk:bundling-stacks": [] },
      });
      const bundlingStack = new Stack(bundlingApp, "TestStack");
      Aspects.of(bundlingStack).add(
        new LambdaAndStepFunctionVersioningAspect()
      );

      const bucket = new Bucket(bundlingStack, "DeployBucket");
      new BucketDeployment(bundlingStack, "DeployAssets", {
        destinationBucket: bucket,
        sources: [Source.data("hello.txt", "hello world")],
      });

      bundlingApp.synth();
      return bundlingStack;
    };

    it("should not add an alias to the BucketDeployment handler lambda", () => {
      const synthStack = synthWithBucketDeployment();

      const template = Template.fromStack(synthStack);
      const aliases = template.findResources("AWS::Lambda::Alias");
      const singletonAlias = Object.keys(aliases).find(id =>
        id.includes("CustomCDKBucketDeployment")
      );
      expect(singletonAlias).toBeUndefined();
    });
  });
});
