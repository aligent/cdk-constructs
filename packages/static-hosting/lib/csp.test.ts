import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { RequestFunction, ResponseFunction } from "./csp";

describe("CSP Functions", () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
  });

  describe("RequestFunction", () => {
    it("should create edge function with default properties", () => {
      new RequestFunction(stack, "TestRequestFunction", {});

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-request.handler",
        Runtime: "nodejs22.x",
      });
    });

    it("should create edge function with custom path prefix", () => {
      new RequestFunction(stack, "TestRequestFunction", {
        pathPrefix: "/admin",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-request.handler",
        Runtime: "nodejs22.x",
      });
    });

    it("should create edge function with custom root object", () => {
      new RequestFunction(stack, "TestRequestFunction", {
        rootObject: "app.html",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-request.handler",
        Runtime: "nodejs22.x",
      });
    });

    it("should support custom function options", () => {
      new RequestFunction(stack, "TestRequestFunction", {
        functionOptions: {
          memorySize: 256,
          description: "Custom CSP request function",
        },
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-request.handler",
        Runtime: "nodejs22.x",
        MemorySize: 256,
        Description: "Custom CSP request function",
      });
    });

    it("should create function version", () => {
      const requestFunction = new RequestFunction(
        stack,
        "TestRequestFunction",
        {}
      );
      const version = requestFunction.getFunctionVersion();
      expect(version).toBeDefined();

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Version", {
        FunctionName: {
          Ref: Match.anyValue(),
        },
      });
    });
  });

  describe("ResponseFunction", () => {
    it("should create edge function with required bucket", () => {
      new ResponseFunction(stack, "TestResponseFunction", {
        bucket: "test-bucket",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-response.handler",
        Runtime: "nodejs22.x",
        Timeout: 3,
        MemorySize: 512,
      });
    });

    it("should create edge function with all CSP options", () => {
      new ResponseFunction(stack, "TestResponseFunction", {
        bucket: "test-bucket",
        cspObject: "custom-csp.txt",
        reportUri: "https://csp-report.example.com",
        fallbackCsp: "default-src 'self'",
        bucketRegion: "eu-west-1",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-response.handler",
        Runtime: "nodejs22.x",
        Timeout: 3,
        MemorySize: 512,
      });
    });

    it("should support custom function options", () => {
      new ResponseFunction(stack, "TestResponseFunction", {
        bucket: "test-bucket",
        functionOptions: {
          memorySize: 1024,
          description: "Custom CSP response function",
        },
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-response.handler",
        Runtime: "nodejs22.x",
        MemorySize: 1024,
        Description: "Custom CSP response function",
      });
    });

    it("should create function version", () => {
      const responseFunction = new ResponseFunction(
        stack,
        "TestResponseFunction",
        {
          bucket: "test-bucket",
        }
      );
      const version = responseFunction.getFunctionVersion();
      expect(version).toBeDefined();

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Version", {
        FunctionName: {
          Ref: Match.anyValue(),
        },
      });
    });

    it("should handle long bucket names", () => {
      new ResponseFunction(stack, "TestResponseFunction", {
        bucket: "very-long-bucket-name-that-exceeds-normal-length.example.com",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-response.handler",
        Runtime: "nodejs22.x",
      });
    });
  });

  describe("Edge Lambda IAM Permissions", () => {
    it("should have correct IAM role for edge execution", () => {
      new RequestFunction(stack, "TestRequestFunction", {});

      const template = Template.fromStack(stack);

      // Check that IAM role exists with proper trust policy
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Principal: {
                Service: "lambda.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            }),
            Match.objectLike({
              Effect: "Allow",
              Principal: {
                Service: "edgelambda.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            }),
          ]),
        },
      });

      // Check that managed policies are attached
      template.hasResourceProperties("AWS::IAM::Role", {
        ManagedPolicyArns: Match.anyValue(),
      });
    });
  });

  describe("Multiple CSP Functions", () => {
    it("should support multiple request functions", () => {
      new RequestFunction(stack, "Request1", { pathPrefix: "/admin" });
      new RequestFunction(stack, "Request2", { pathPrefix: "/user" });

      const template = Template.fromStack(stack);

      const functions = template.findResources("AWS::Lambda::Function");
      const requestFunctions = Object.keys(functions).filter(
        key => functions[key].Properties.Handler === "origin-request.handler"
      );
      expect(requestFunctions).toHaveLength(2);
    });

    it("should support multiple response functions", () => {
      new ResponseFunction(stack, "Response1", { bucket: "bucket1" });
      new ResponseFunction(stack, "Response2", { bucket: "bucket2" });

      const template = Template.fromStack(stack);

      const functions = template.findResources("AWS::Lambda::Function");
      const responseFunctions = Object.keys(functions).filter(
        key => functions[key].Properties.Handler === "origin-response.handler"
      );
      expect(responseFunctions).toHaveLength(2);
    });
  });
});
