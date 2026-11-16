import { App, Aspects, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { S3DefaultsAspect } from "./s3-bucket";

type Profile = "SHORT" | "MEDIUM" | "LONG";

const AUTO_DELETE_RESOURCE_TYPE = "Custom::S3AutoDeleteObjects";

describe("S3DefaultsAspect", () => {
  let app: App;
  let stack: Stack;

  const setup = (duration: Profile) => {
    app = new App();
    stack = new Stack(app, "TestStack");
    Aspects.of(stack).add(new S3DefaultsAspect({ duration }));
  };

  const synth = () => {
    app.synth();
    return Template.fromStack(stack);
  };

  describe.each([
    { duration: "SHORT" as const, expirationInDays: 30 },
    { duration: "MEDIUM" as const, expirationInDays: 90 },
  ])("$duration duration", ({ duration, expirationInDays }) => {
    beforeEach(() => setup(duration));

    it("adds the profile expiry rule to an L2 bucket with no lifecycle rules", () => {
      new Bucket(stack, "MyBucket");

      synth().hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: {
          Rules: [{ ExpirationInDays: expirationInDays, Status: "Enabled" }],
        },
      });
    });

    it("keeps only the bucket's own lifecycle rules when it has some", () => {
      new Bucket(stack, "MyBucket", {
        lifecycleRules: [
          { abortIncompleteMultipartUploadAfter: Duration.days(7) },
        ],
      });

      synth().hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: {
          Rules: [
            {
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
              Status: "Enabled",
            },
          ],
        },
      });
    });

    it("applies DESTROY removal policy", () => {
      new Bucket(stack, "MyBucket");

      synth().hasResource("AWS::S3::Bucket", {
        DeletionPolicy: "Delete",
        UpdateReplacePolicy: "Delete",
      });
    });

    it("enables auto-delete objects", () => {
      new Bucket(stack, "MyBucket");

      synth().resourceCountIs(AUTO_DELETE_RESOURCE_TYPE, 1);
    });

    it("does not re-enable auto-delete on a bucket that already enabled it", () => {
      new Bucket(stack, "MyBucket", {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

      expect(() => synth()).not.toThrow();
      Template.fromStack(stack).resourceCountIs(AUTO_DELETE_RESOURCE_TYPE, 1);
    });
  });

  describe("LONG duration", () => {
    beforeEach(() => setup("LONG"));

    it("does not add lifecycle rules", () => {
      new Bucket(stack, "MyBucket");

      synth().hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: Match.absent(),
      });
    });

    it("applies RETAIN removal policy", () => {
      new Bucket(stack, "MyBucket");

      synth().hasResource("AWS::S3::Bucket", {
        DeletionPolicy: "Retain",
        UpdateReplacePolicy: "Retain",
      });
    });

    it("does not enable auto-delete objects", () => {
      new Bucket(stack, "MyBucket");

      synth().resourceCountIs(AUTO_DELETE_RESOURCE_TYPE, 0);
    });

    it("keeps DESTROY on a bucket that enabled auto-delete itself", () => {
      new Bucket(stack, "MyBucket", {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });

      const template = synth();
      template.hasResource("AWS::S3::Bucket", {
        DeletionPolicy: "Delete",
        UpdateReplacePolicy: "Delete",
      });
      template.resourceCountIs(AUTO_DELETE_RESOURCE_TYPE, 1);
    });
  });
});
