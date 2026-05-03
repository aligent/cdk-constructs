import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { LambdaIntegration, MockIntegration } from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { Function, InlineCode, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { SecureRestApi } from "./secure-rest-api";

const createStack = () => {
  const app = new App();
  const stack = new Stack(app, "TestStack");
  return { app, stack };
};

const mockIntegration = () =>
  new MockIntegration({
    integrationResponses: [{ statusCode: "200" }],
  });

const lambdaIntegration = (scope: Construct) => {
  const fn = new Function(scope, "Handler", {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: InlineCode.fromInline("exports.handler = () => {}"),
  });
  return new LambdaIntegration(fn);
};

describe("SecureRestApi", () => {
  describe("API Gateway", () => {
    it("creates a REST API with the given name", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::RestApi",
        { Name: "my-api" }
      );
    });

    it("uses the provided description", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        description: "Custom description",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::RestApi",
        { Description: "Custom description" }
      );
    });

    it("registers each route method with apiKeyRequired", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET, HttpMethod.POST],
            integration: mockIntegration(),
          },
        ],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "GET",
        ApiKeyRequired: true,
      });
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        ApiKeyRequired: true,
      });
    });

    it("accepts a LambdaIntegration as route integration", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: lambdaIntegration(stack),
          },
        ],
      });

      Template.fromStack(stack).resourceCountIs("AWS::Lambda::Function", 1);
    });
  });

  describe("API Key", () => {
    it("creates an API key with a default name", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::ApiKey",
        { Name: "my-api-api-key" }
      );
    });

    it("uses a custom API key name when provided", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        apiKeyName: "custom-key",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::ApiKey",
        { Name: "custom-key" }
      );
    });
  });

  describe("Usage Plan", () => {
    it("creates a usage plan with default throttle settings", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::UsagePlan",
        {
          Throttle: {
            BurstLimit: 200,
            RateLimit: 100,
          },
        }
      );
    });

    it("uses custom throttle settings when provided", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        throttle: { rateLimit: 50, burstLimit: 100 },
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::UsagePlan",
        {
          Throttle: {
            BurstLimit: 100,
            RateLimit: 50,
          },
        }
      );
    });

    it("uses a custom usage plan name when provided", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        usagePlanName: "custom-plan",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::UsagePlan",
        { UsagePlanName: "custom-plan" }
      );
    });
  });

  describe("CORS", () => {
    it("applies default CORS settings", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Method",
        { HttpMethod: "OPTIONS" }
      );
    });

    it("applies custom CORS allow-origins", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        corsOptions: { allowOrigins: ["https://example.com"] },
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Method",
        { HttpMethod: "OPTIONS" }
      );
    });
  });
});
