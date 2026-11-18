import { App, Duration, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  LambdaIntegration,
  MockIntegration,
  TokenAuthorizer,
} from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { Function, InlineCode, Runtime } from "aws-cdk-lib/aws-lambda";
import { CfnSecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import {
  SecureRestApi,
  SecureRestApiProps,
  SecureRestApiRoute,
} from "./secure-rest-api";

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

    it("registers each route method without requiring an API key", () => {
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
        ApiKeyRequired: Match.absent(),
      });
      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "POST",
        ApiKeyRequired: Match.absent(),
      });
    });

    it("registers a nested multi-segment route", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "rewards/accounts/{accountId}/redeem",
            methods: [HttpMethod.POST],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Method",
        {
          HttpMethod: "POST",
          AuthorizationType: "CUSTOM",
        }
      );
    });

    it("creates intermediate resources for a nested route", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "rewards/accounts/{accountId}/redeem",
            methods: [HttpMethod.POST],
            integration: mockIntegration(),
          },
        ],
      });

      const template = Template.fromStack(stack);
      for (const pathPart of ["rewards", "accounts", "{accountId}", "redeem"]) {
        template.hasResourceProperties("AWS::ApiGateway::Resource", {
          PathPart: pathPart,
        });
      }
    });

    it("resolves routes sharing a prefix without duplicate resources", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "rewards/accounts/{accountId}/redeem",
            methods: [HttpMethod.POST],
            integration: mockIntegration(),
          },
          {
            path: "rewards/reversal",
            methods: [HttpMethod.POST],
            integration: mockIntegration(),
          },
        ],
      });

      const template = Template.fromStack(stack);
      const resourcesByPathPart = (pathPart: string) =>
        Object.values(
          template.findResources("AWS::ApiGateway::Resource")
        ).filter(r => r.Properties?.PathPart === pathPart);

      // The shared "rewards" parent is created exactly once.
      expect(resourcesByPathPart("rewards")).toHaveLength(1);

      // Both leaf resources exist under the shared parent.
      expect(resourcesByPathPart("redeem")).toHaveLength(1);
      expect(resourcesByPathPart("reversal")).toHaveLength(1);

      template.resourcePropertiesCountIs(
        "AWS::ApiGateway::Method",
        { HttpMethod: "POST", AuthorizationType: "CUSTOM" },
        2
      );
    });

    it("registers alias paths with the same methods and integration", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "customers",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
            aliasPaths: ["people"],
          },
        ],
      });

      const template = Template.fromStack(stack);
      for (const pathPart of ["customers", "people"]) {
        template.hasResourceProperties("AWS::ApiGateway::Resource", {
          PathPart: pathPart,
        });
      }
      template.resourcePropertiesCountIs(
        "AWS::ApiGateway::Method",
        { HttpMethod: "GET", AuthorizationType: "CUSTOM" },
        2
      );
    });

    it("registers a nested alias path sharing a param name", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "customers/{id}/addresses",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
            aliasPaths: ["people/{id}/addresses"],
          },
        ],
      });

      const template = Template.fromStack(stack);
      for (const pathPart of ["customers", "people", "{id}", "addresses"]) {
        template.hasResourceProperties("AWS::ApiGateway::Resource", {
          PathPart: pathPart,
        });
      }
      template.resourcePropertiesCountIs(
        "AWS::ApiGateway::Method",
        { HttpMethod: "GET", AuthorizationType: "CUSTOM" },
        2
      );
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

      Template.fromStack(stack).hasResourceProperties("AWS::Lambda::Function", {
        Handler: "index.handler",
      });
    });
  });

  describe("Deployment stage", () => {
    it("uses a custom stage name from deployOptions", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        deployOptions: { stageName: "staging" },
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Stage",
        {
          StageName: "staging",
        }
      );
    });

    it("defaults the stage name to prod", () => {
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
        "AWS::ApiGateway::Stage",
        {
          StageName: "prod",
        }
      );
    });
  });

  describe("Default token authorizer", () => {
    const createDefaultApi = () => {
      const { stack } = createStack();
      const secureApi = new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET, HttpMethod.POST],
            integration: mockIntegration(),
          },
          {
            path: "customers/{id}/addresses",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
            aliasPaths: ["people/{id}/addresses"],
          },
        ],
      });
      return { stack, secureApi, template: Template.fromStack(stack) };
    };

    const methodsExcludingPreflight = (template: Template) =>
      Object.values(template.findResources("AWS::ApiGateway::Method")).filter(
        method => method.Properties.HttpMethod !== "OPTIONS"
      );

    it("requires the default authorizer on every registered method, including nested and alias paths", () => {
      const { template } = createDefaultApi();

      const methods = methodsExcludingPreflight(template);
      expect(methods).toHaveLength(4);
      for (const method of methods) {
        expect(method.Properties.AuthorizationType).toBe("CUSTOM");
        expect(method.Properties.AuthorizerId).toBeDefined();
      }
    });

    it("leaves CORS preflight methods without an authorizer", () => {
      const { template } = createDefaultApi();

      template.hasResourceProperties("AWS::ApiGateway::Method", {
        HttpMethod: "OPTIONS",
        AuthorizationType: "NONE",
      });
    });

    it("creates a TOKEN authorizer reading the Authorization header with a 60 second cache TTL", () => {
      const { template } = createDefaultApi();

      template.resourceCountIs("AWS::ApiGateway::Authorizer", 1);
      template.hasResourceProperties("AWS::ApiGateway::Authorizer", {
        Type: "TOKEN",
        IdentitySource: "method.request.header.Authorization",
        AuthorizerResultTtlInSeconds: 60,
      });
    });

    it("generates a plain string secret and exposes it on the construct", () => {
      const { secureApi, template } = createDefaultApi();

      expect(secureApi.secret).toBeDefined();
      template.resourceCountIs("AWS::SecretsManager::Secret", 1);
      const [secret] = Object.values(
        template.findResources("AWS::SecretsManager::Secret")
      );
      expect(secret.Properties.GenerateSecretString).toBeDefined();
      expect(
        secret.Properties.GenerateSecretString.SecretStringTemplate
      ).toBeUndefined();
      expect(secret.Properties.SecretString).toBeUndefined();
    });

    it("passes the secret to the authorizer function via environment variable", () => {
      const { stack, secureApi, template } = createDefaultApi();
      const secretLogicalId = stack.getLogicalId(
        secureApi.secret?.node.defaultChild as CfnSecret
      );

      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: { Variables: { SECRET_ARN: { Ref: secretLogicalId } } },
      });
    });

    it("grants the authorizer function read access to the secret", () => {
      const { stack, secureApi, template } = createDefaultApi();
      const secretLogicalId = stack.getLogicalId(
        secureApi.secret?.node.defaultChild as CfnSecret
      );

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["secretsmanager:GetSecretValue"]),
              Effect: "Allow",
              Resource: { Ref: secretLogicalId },
            }),
          ]),
        },
      });
    });

    it("runs the bundled token authorizer handler", () => {
      const { template } = createDefaultApi();

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "token-authorizer.handler",
        Runtime: "nodejs24.x",
      });
    });
  });

  describe("Customising the default authorizer", () => {
    const routes: SecureRestApiProps["routes"] = [
      {
        path: "items",
        methods: [HttpMethod.GET],
        integration: mockIntegration(),
      },
    ];

    it("overrides the authorizer cache TTL", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes,
        authorizerCacheTtl: Duration.seconds(300),
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Authorizer",
        { AuthorizerResultTtlInSeconds: 300 }
      );
    });
  });

  describe("Bring your own authorizer", () => {
    const routes: SecureRestApiProps["routes"] = [
      {
        path: "items",
        methods: [HttpMethod.GET, HttpMethod.POST],
        integration: mockIntegration(),
      },
      {
        path: "customers/{id}/addresses",
        methods: [HttpMethod.GET],
        integration: mockIntegration(),
        aliasPaths: ["people/{id}/addresses"],
      },
    ];

    const createWithCustomAuthorizer = (
      extraProps: Partial<SecureRestApiProps>
    ) => {
      const { stack } = createStack();
      const handler = new Function(stack, "CustomAuthorizerHandler", {
        runtime: Runtime.NODEJS_22_X,
        handler: "custom.handler",
        code: InlineCode.fromInline("exports.handler = () => {}"),
      });
      return () =>
        new SecureRestApi(stack, "Api", {
          apiName: "my-api",
          routes,
          authorizer: new TokenAuthorizer(stack, "CustomAuthorizer", {
            handler,
          }),
          ...extraProps,
        });
    };

    it("throws when authorizerCacheTtl is supplied with a custom authorizer", () => {
      const create = createWithCustomAuthorizer({
        authorizerCacheTtl: Duration.seconds(30),
      });

      expect(create).toThrow(/authorizerCacheTtl.*authorizer/i);
    });

    const createCognitoApi = () => {
      const { stack } = createStack();
      const userPool = new UserPool(stack, "UserPool");
      const secureApi = new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes,
        authorizer: new CognitoUserPoolsAuthorizer(stack, "CognitoAuthorizer", {
          cognitoUserPools: [userPool],
        }),
      });
      return { stack, secureApi, template: Template.fromStack(stack) };
    };

    const createLambdaAuthorizerApi = () => {
      const { stack } = createStack();
      const handler = new Function(stack, "CustomAuthorizerHandler", {
        runtime: Runtime.NODEJS_22_X,
        handler: "custom.handler",
        code: InlineCode.fromInline("exports.handler = () => {}"),
      });
      const secureApi = new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes,
        authorizer: new TokenAuthorizer(stack, "CustomAuthorizer", { handler }),
      });
      return { stack, secureApi, template: Template.fromStack(stack) };
    };

    const methodsExcludingPreflight = (template: Template) =>
      Object.values(template.findResources("AWS::ApiGateway::Method")).filter(
        method => method.Properties.HttpMethod !== "OPTIONS"
      );

    it("attaches a Cognito authorizer to every registered method", () => {
      const { template } = createCognitoApi();

      const methods = methodsExcludingPreflight(template);
      expect(methods).toHaveLength(4);
      for (const method of methods) {
        expect(method.Properties.AuthorizationType).toBe("COGNITO_USER_POOLS");
        expect(method.Properties.AuthorizerId).toBeDefined();
      }
    });

    it("attaches a custom Lambda authorizer to every registered method", () => {
      const { template } = createLambdaAuthorizerApi();

      const methods = methodsExcludingPreflight(template);
      expect(methods).toHaveLength(4);
      for (const method of methods) {
        expect(method.Properties.AuthorizationType).toBe("CUSTOM");
        expect(method.Properties.AuthorizerId).toBeDefined();
      }
    });

    it("creates only the supplied authorizer, not the default one", () => {
      const { template } = createCognitoApi();

      template.resourceCountIs("AWS::ApiGateway::Authorizer", 1);
      template.hasResourceProperties("AWS::ApiGateway::Authorizer", {
        Type: "COGNITO_USER_POOLS",
      });
    });

    it("creates no default authorizer Lambda or secret with a Cognito authorizer", () => {
      const { template } = createCognitoApi();

      template.resourceCountIs("AWS::SecretsManager::Secret", 0);
      template.resourceCountIs("AWS::Lambda::Function", 0);
    });

    it("creates no default authorizer Lambda or secret with a custom Lambda authorizer", () => {
      const { template } = createLambdaAuthorizerApi();

      template.resourceCountIs("AWS::SecretsManager::Secret", 0);
      template.resourceCountIs("AWS::Lambda::Function", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "custom.handler",
      });
    });

    it("leaves secret undefined when a custom authorizer is used", () => {
      expect(createCognitoApi().secureApi.secret).toBeUndefined();
      expect(createLambdaAuthorizerApi().secureApi.secret).toBeUndefined();
    });
  });

  describe("Per-route authorizer", () => {
    const createRouteOverrideApi = (
      routeAuthorizer: (scope: Construct) => SecureRestApiRoute["authorizer"]
    ) => {
      const { stack } = createStack();
      const secureApi = new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: [
          {
            path: "protected",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
          {
            path: "overridden",
            methods: [HttpMethod.GET, HttpMethod.POST],
            integration: mockIntegration(),
            aliasPaths: ["overridden-alias"],
            authorizer: routeAuthorizer(stack),
          },
        ],
      });
      return { stack, secureApi, template: Template.fromStack(stack) };
    };

    const methodsAt = (template: Template, resourcePathPart: string) => {
      const resources = template.findResources("AWS::ApiGateway::Resource", {
        Properties: { PathPart: resourcePathPart },
      });
      const [logicalId] = Object.keys(resources);
      return Object.values(
        template.findResources("AWS::ApiGateway::Method", {
          Properties: { ResourceId: { Ref: logicalId } },
        })
      ).filter(method => method.Properties.HttpMethod !== "OPTIONS");
    };

    const cognitoAuthorizer = (scope: Construct) =>
      new CognitoUserPoolsAuthorizer(scope, "RouteCognitoAuthorizer", {
        cognitoUserPools: [new UserPool(scope, "UserPool")],
      });

    it("applies a route-level authorizer to that route only", () => {
      const { template } = createRouteOverrideApi(cognitoAuthorizer);

      const overridden = methodsAt(template, "overridden");
      const protectedMethods = methodsAt(template, "protected");
      for (const method of overridden) {
        expect(method.Properties.AuthorizationType).toBe("COGNITO_USER_POOLS");
      }
      for (const method of protectedMethods) {
        expect(method.Properties.AuthorizationType).toBe("CUSTOM");
      }
      expect(overridden[0].Properties.AuthorizerId).not.toEqual(
        protectedMethods[0].Properties.AuthorizerId
      );
    });

    it("leaves methods unauthenticated when a route is explicitly public", () => {
      const { template } = createRouteOverrideApi(() => AuthorizationType.NONE);

      const publicMethods = methodsAt(template, "overridden");
      expect(publicMethods).toHaveLength(2);
      for (const method of publicMethods) {
        expect(method.Properties.AuthorizationType).toBe("NONE");
        expect(method.Properties.AuthorizerId).toBeUndefined();
      }
    });

    it("keeps other routes protected when one route is public", () => {
      const { template } = createRouteOverrideApi(() => AuthorizationType.NONE);

      const protectedMethods = methodsAt(template, "protected");
      expect(protectedMethods).toHaveLength(1);
      expect(protectedMethods[0].Properties.AuthorizationType).toBe("CUSTOM");
      expect(protectedMethods[0].Properties.AuthorizerId).toBeDefined();
    });

    it("applies the route override to its alias paths", () => {
      const { template } = createRouteOverrideApi(() => AuthorizationType.NONE);

      const aliasMethods = methodsAt(template, "overridden-alias");
      expect(aliasMethods).toHaveLength(2);
      for (const method of aliasMethods) {
        expect(method.Properties.AuthorizationType).toBe("NONE");
      }
    });

    it("uses a supplied API-level authorizer for routes without an override", () => {
      const { stack } = createStack();
      const handler = new Function(stack, "CustomAuthorizerHandler", {
        runtime: Runtime.NODEJS_22_X,
        handler: "custom.handler",
        code: InlineCode.fromInline("exports.handler = () => {}"),
      });
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        authorizer: new TokenAuthorizer(stack, "CustomAuthorizer", { handler }),
        routes: [
          {
            path: "protected",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
          {
            path: "health",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
            authorizer: AuthorizationType.NONE,
          },
        ],
      });
      const template = Template.fromStack(stack);

      expect(methodsAt(template, "protected")[0].Properties).toMatchObject({
        AuthorizationType: "CUSTOM",
      });
      expect(methodsAt(template, "health")[0].Properties).toMatchObject({
        AuthorizationType: "NONE",
      });
    });

    it("never makes a route public without an explicit override", () => {
      const { template } = createRouteOverrideApi(cognitoAuthorizer);

      for (const path of ["protected", "overridden", "overridden-alias"]) {
        for (const method of methodsAt(template, path)) {
          expect(method.Properties.AuthorizationType).not.toBe("NONE");
        }
      }
    });
  });

  describe("Throttling", () => {
    const createThrottledTemplate = (
      props: Partial<SecureRestApiProps> = {}
    ) => {
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
        ...props,
      });
      return Template.fromStack(stack);
    };

    const stageMethodSettings = (
      template: Template
    ): Array<Record<string, unknown>> => {
      const stages = Object.values(
        template.findResources("AWS::ApiGateway::Stage")
      );
      return stages.flatMap(stage => stage.Properties.MethodSettings ?? []);
    };

    it("creates no API key or usage plan", () => {
      const template = createThrottledTemplate();

      template.resourceCountIs("AWS::ApiGateway::ApiKey", 0);
      template.resourceCountIs("AWS::ApiGateway::UsagePlan", 0);
      template.resourceCountIs("AWS::ApiGateway::UsagePlanKey", 0);
    });

    it("applies the default 100 rps / 200 burst at stage level", () => {
      const template = createThrottledTemplate();

      expect(stageMethodSettings(template)).toEqual([
        expect.objectContaining({
          HttpMethod: "*",
          ResourcePath: "/*",
          ThrottlingRateLimit: 100,
          ThrottlingBurstLimit: 200,
        }),
      ]);
    });

    it("applies custom throttle settings at stage level", () => {
      const template = createThrottledTemplate({
        throttle: { rateLimit: 50, burstLimit: 100 },
      });

      expect(stageMethodSettings(template)).toEqual([
        expect.objectContaining({
          ThrottlingRateLimit: 50,
          ThrottlingBurstLimit: 100,
        }),
      ]);
    });

    it("lets throttling in deployOptions take precedence over throttle", () => {
      const template = createThrottledTemplate({
        throttle: { rateLimit: 50, burstLimit: 100 },
        deployOptions: { throttlingRateLimit: 10, throttlingBurstLimit: 20 },
      });

      expect(stageMethodSettings(template)).toEqual([
        expect.objectContaining({
          ThrottlingRateLimit: 10,
          ThrottlingBurstLimit: 20,
        }),
      ]);
    });

    it("ignores undefined throttling in deployOptions", () => {
      const template = createThrottledTemplate({
        deployOptions: {
          throttlingRateLimit: undefined,
          throttlingBurstLimit: undefined,
        },
      });

      expect(stageMethodSettings(template)).toEqual([
        expect.objectContaining({
          ThrottlingRateLimit: 100,
          ThrottlingBurstLimit: 200,
        }),
      ]);
    });

    it("keeps other deployOptions alongside the throttle default", () => {
      const template = createThrottledTemplate({
        deployOptions: { stageName: "dev" },
      });

      template.hasResourceProperties("AWS::ApiGateway::Stage", {
        StageName: "dev",
        MethodSettings: [
          Match.objectLike({
            ThrottlingRateLimit: 100,
            ThrottlingBurstLimit: 200,
          }),
        ],
      });
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
        {
          HttpMethod: "OPTIONS",
          Integration: {
            IntegrationResponses: [
              {
                ResponseParameters: {
                  "method.response.header.Access-Control-Allow-Headers":
                    "'Content-Type,Authorization'",
                },
              },
            ],
          },
        }
      );
    });

    it("appends additionalHeaders to the defaults", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        corsOptions: { additionalHeaders: ["X-Custom"] },
        routes: [
          {
            path: "items",
            methods: [HttpMethod.GET],
            integration: mockIntegration(),
          },
        ],
      });

      // OPTIONS mock integration response headers include the allow-headers value
      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::Method",
        {
          HttpMethod: "OPTIONS",
          Integration: {
            IntegrationResponses: [
              {
                ResponseParameters: {
                  "method.response.header.Access-Control-Allow-Headers":
                    "'Content-Type,Authorization,X-Custom'",
                },
              },
            ],
          },
        }
      );
    });

    it("appends additionalMethods to the defaults", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        corsOptions: { additionalMethods: ["POST"] },
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
        {
          HttpMethod: "OPTIONS",
          Integration: {
            IntegrationResponses: [
              {
                ResponseParameters: {
                  "method.response.header.Access-Control-Allow-Methods":
                    "'GET,OPTIONS,POST'",
                },
              },
            ],
          },
        }
      );
    });
  });

  describe("IP allowlist", () => {
    const routes = () => [
      {
        path: "items",
        methods: [HttpMethod.GET],
        integration: mockIntegration(),
      },
    ];

    it("allows invocation only from the given IPs via a resource policy", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        allowedIps: ["203.0.113.0/24"],
        routes: routes(),
      });

      Template.fromStack(stack).hasResourceProperties(
        "AWS::ApiGateway::RestApi",
        {
          Policy: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { AWS: "*" },
                Action: "execute-api:Invoke",
                Resource: "execute-api:/*",
              },
              {
                Effect: "Deny",
                Principal: { AWS: "*" },
                Action: "execute-api:Invoke",
                Resource: "execute-api:/*",
                Condition: {
                  NotIpAddress: { "aws:SourceIp": ["203.0.113.0/24"] },
                },
              },
            ],
          },
        }
      );
    });

    it("sets no resource policy when allowedIps is omitted", () => {
      const { stack } = createStack();
      new SecureRestApi(stack, "Api", {
        apiName: "my-api",
        routes: routes(),
      });

      const [restApi] = Object.values(
        Template.fromStack(stack).findResources("AWS::ApiGateway::RestApi")
      );
      expect(restApi.Properties.Policy).toBeUndefined();
    });

    it("throws when allowedIps is empty", () => {
      const { stack } = createStack();

      expect(
        () =>
          new SecureRestApi(stack, "Api", {
            apiName: "my-api",
            allowedIps: [],
            routes: routes(),
          })
      ).toThrow("allowedIps must contain at least one entry");
    });

    it("throws naming every invalid IP address or CIDR range", () => {
      const { stack } = createStack();
      const invalid = [
        "999.1.1.1",
        "10.0.0.0/33",
        "::1/129",
        "10.0.0.0/",
        "10.0.0.0/8/8",
        "not-an-ip",
      ];

      expect(
        () =>
          new SecureRestApi(stack, "Api", {
            apiName: "my-api",
            allowedIps: ["203.0.113.0/24", ...invalid],
            routes: routes(),
          })
      ).toThrow(
        "allowedIps contains invalid IP addresses or CIDR ranges: " +
          "999.1.1.1, 10.0.0.0/33, ::1/129, 10.0.0.0/, 10.0.0.0/8/8, not-an-ip"
      );
    });

    it.each([
      ["a bare IPv4 address", "203.0.113.7"],
      ["a bare IPv6 address", "2001:db8::1"],
      ["an IPv6 CIDR range", "2001:db8::/32"],
      ["the IPv4 match-all range", "0.0.0.0/0"],
      ["the IPv6 match-all range", "::/0"],
    ])("accepts %s", (_description, ip) => {
      const { stack } = createStack();

      expect(
        () =>
          new SecureRestApi(stack, "Api", {
            apiName: "my-api",
            allowedIps: [ip],
            routes: routes(),
          })
      ).not.toThrow();
    });

    it("redeploys the API when the allowlist changes", () => {
      const deploymentIdFor = (allowedIps: string[]) => {
        const { stack } = createStack();
        new SecureRestApi(stack, "Api", {
          apiName: "my-api",
          allowedIps,
          routes: routes(),
        });
        return Object.keys(
          Template.fromStack(stack).findResources("AWS::ApiGateway::Deployment")
        )[0];
      };

      expect(deploymentIdFor(["203.0.113.0/24"])).not.toEqual(
        deploymentIdFor(["198.51.100.0/24"])
      );
    });
  });
});
