import {
  ApiKey,
  Cors,
  Integration,
  IRestApi,
  RestApi,
  UsagePlan,
} from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { Construct } from "constructs";

export interface SecureRestApiRoute {
  path: string;
  methods: HttpMethod[];
  integration: Integration;
}

export interface SecureRestApiProps {
  /**
   * The name of the API.
   */
  apiName: string;

  /**
   * Description for the API.
   */
  description?: string;

  /**
   * CORS configuration.
   *
   * `allowOrigins` overrides the default (all origins).
   * `additionalMethods` and `additionalHeaders` are appended to the defaults
   * (GET/OPTIONS and Content-Type/X-Api-Key respectively).
   */
  corsOptions?: {
    allowOrigins?: string[];
    additionalMethods?: string[];
    additionalHeaders?: string[];
  };

  /**
   * Routes to register on the API.
   */
  routes: SecureRestApiRoute[];

  /**
   * Throttling limits for the usage plan.
   * @default { rateLimit: 100, burstLimit: 200 }
   */
  throttle?: {
    rateLimit: number;
    burstLimit: number;
  };

  /**
   * Override the generated API key name.
   * @default `{apiName}-api-key`
   */
  apiKeyName?: string;

  /**
   * Override the generated usage plan name.
   * @default `{apiName}-usage-plan`
   */
  usagePlanName?: string;
}

export class SecureRestApi extends Construct {
  public readonly api: RestApi;
  public readonly apiKey: ApiKey;
  public readonly usagePlan: UsagePlan;

  constructor(scope: Construct, id: string, props: SecureRestApiProps) {
    super(scope, id);

    const {
      apiName,
      description,
      corsOptions,
      routes,
      throttle = { rateLimit: 100, burstLimit: 200 },
      apiKeyName,
      usagePlanName,
    } = props;

    this.api = new RestApi(this, "Api", {
      restApiName: apiName,
      description: description ?? `REST API for ${apiName} service`,
      defaultCorsPreflightOptions: {
        allowOrigins: corsOptions?.allowOrigins ?? Cors.ALL_ORIGINS,
        allowMethods: [
          "GET",
          "OPTIONS",
          ...(corsOptions?.additionalMethods ?? []),
        ],
        allowHeaders: [
          "Content-Type",
          "X-Api-Key",
          ...(corsOptions?.additionalHeaders ?? []),
        ],
      },
    });

    for (const route of routes) {
      const resource = this.api.root.addResource(route.path.replace(/^\//, ""));
      for (const method of route.methods) {
        resource.addMethod(method, route.integration, { apiKeyRequired: true });
      }
    }

    this.apiKey = new ApiKey(this, "ApiKey", {
      description: `API Key for ${apiName} service`,
      apiKeyName: apiKeyName ?? `${apiName}-api-key`,
    });

    this.usagePlan = new UsagePlan(this, "UsagePlan", {
      name: usagePlanName ?? `${apiName}-usage-plan`,
      description: `Usage plan for ${apiName} service`,
      throttle,
    });

    this.usagePlan.addApiStage({
      api: this.api as IRestApi,
      stage: this.api.deploymentStage,
    });
    this.usagePlan.addApiKey(this.apiKey);
  }
}
