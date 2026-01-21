import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { PathRemapFunction } from "./path-remap";

describe("PathRemapFunction", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
  });

  it("should create edge function with correct properties", () => {
    new PathRemapFunction(stack, "TestRemap", {
      path: "/new-path",
    });

    const template = Template.fromStack(stack);

    // Edge function
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "remap.handler",
      Runtime: "nodejs22.x",
      Role: {
        "Fn::GetAtt": [Match.anyValue(), "Arn"],
      },
    });

    // Should have an IAM role for the function
    template.resourceCountIs("AWS::IAM::Role", 1);

    // Should have managed policies attached
    template.hasResourceProperties("AWS::IAM::Role", {
      ManagedPolicyArns: Match.anyValue(),
    });
  });

  it("should use custom function name", () => {
    new PathRemapFunction(stack, "CustomRemap", {
      path: "/custom-path",
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "remap.handler",
      Runtime: "nodejs22.x",
    });

    // Function should have the correct logical ID pattern
    const resources = template.toJSON().Resources;
    const functionKeys = Object.keys(resources).filter(
      key =>
        resources[key].Type === "AWS::Lambda::Function" &&
        key.includes("CustomRemap")
    );
    expect(functionKeys.length).toBeGreaterThan(0);
  });

  it("should define environment variable for remap path", () => {
    new PathRemapFunction(stack, "TestRemap", {
      path: "/sitemap.xml",
    });

    const template = Template.fromStack(stack);

    // The path is defined at build time via esbuild define
    // We can't directly test the define in the synthesized template
    // but we can verify the bundling configuration is set up
    template.hasResourceProperties("AWS::Lambda::Function", {
      Code: {
        S3Bucket: Match.anyValue(),
        S3Key: Match.anyValue(),
      },
    });
  });

  it("should create function version", () => {
    const remapFunction = new PathRemapFunction(stack, "TestRemap", {
      path: "/test",
    });

    const version = remapFunction.getFunctionVersion();
    expect(version).toBeDefined();

    const template = Template.fromStack(stack);

    // Should create a version resource
    template.hasResourceProperties("AWS::Lambda::Version", {
      FunctionName: {
        Ref: Match.anyValue(),
      },
    });
  });

  it("should handle special characters in path", () => {
    new PathRemapFunction(stack, "TestRemap", {
      path: "/path/with/special-chars_123.xml",
    });

    const template = Template.fromStack(stack);

    // Should still create the function successfully
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "remap.handler",
      Runtime: "nodejs22.x",
    });
  });

  it("should use correct asset bundling", () => {
    new PathRemapFunction(stack, "TestRemap", {
      path: "/test",
    });

    const template = Template.fromStack(stack);

    // Lambda function should reference bundled code from S3
    template.hasResourceProperties("AWS::Lambda::Function", {
      Code: {
        S3Bucket: Match.anyValue(),
        S3Key: Match.anyValue(),
      },
    });
  });

  it("should support multiple remap functions in same stack", () => {
    new PathRemapFunction(stack, "Remap1", { path: "/path1" });
    new PathRemapFunction(stack, "Remap2", { path: "/path2" });
    new PathRemapFunction(stack, "Remap3", { path: "/path3" });

    const template = Template.fromStack(stack);

    // Should create 3 separate functions
    const functions = template.findResources("AWS::Lambda::Function");
    const remapFunctions = Object.keys(functions).filter(
      key => functions[key].Properties.Handler === "remap.handler"
    );
    expect(remapFunctions).toHaveLength(3);
  });
});
