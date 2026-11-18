import {
  ApiKey,
  Cors,
  CorsOptions,
  Integration,
  RestApi,
  StageOptions,
  UsagePlan,
} from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import {
  AnyPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { isIPv4, isIPv6 } from "node:net";

export interface SecureRestApiRoute {
  /**
   * The resource path; may be nested/multi-segment (e.g.
   * `rewards/accounts/{accountId}/redeem`). A leading slash is stripped
   * automatically.
   */
  path: string;

  /**
   * HTTP methods to register on the resource.
   */
  methods: HttpMethod[];

  /**
   * The CDK API Gateway integration to invoke for each method.
   */
  integration: Integration;

  /**
   * Additional paths that expose the same methods and integration as `path`.
   *
   * Useful for renaming a route without breaking existing consumers: keep
   * the old path as an alias until callers migrate to the new one.
   */
  aliasPaths?: string[];
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
   * Stage options for the API's default deployment.
   *
   * Use `stageName` to override the deployed stage name.
   * @default stageName "prod" (CDK default)
   */
  deployOptions?: StageOptions;

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

  /**
   * IPv4/IPv6 addresses or CIDR ranges allowed to invoke the API.
   *
   * Enforced with an API Gateway resource policy that denies every other
   * source IP, including CORS preflight (`OPTIONS`) requests. `0.0.0.0/0` and
   * `::/0` are accepted but disable the restriction.
   * @default no IP restriction
   */
  allowedIps?: string[];
}

const MAX_PREFIX_LENGTH = { 4: 32, 6: 128 } as const;

function isValidIpOrCidr(entry: string): boolean {
  const [address, prefix, ...rest] = entry.split("/");
  if (rest.length > 0) return false;

  const version = isIPv4(address) ? 4 : isIPv6(address) ? 6 : undefined;
  if (!version) return false;
  if (prefix === undefined) return true;

  return /^\d+$/.test(prefix) && Number(prefix) <= MAX_PREFIX_LENGTH[version];
}

function validateAllowedIps(allowedIps: string[]): void {
  if (allowedIps.length === 0) {
    throw new Error(
      "allowedIps must contain at least one entry; omit it to allow all IPs"
    );
  }

  const invalid = allowedIps.filter(entry => !isValidIpOrCidr(entry));
  if (invalid.length > 0) {
    throw new Error(
      `allowedIps contains invalid IP addresses or CIDR ranges: ${invalid.join(", ")}`
    );
  }
}

function createIpAllowlistPolicy(allowedIps: string[]): PolicyDocument {
  return new PolicyDocument({
    statements: [
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new AnyPrincipal()],
        actions: ["execute-api:Invoke"],
        resources: ["execute-api:/*"],
      }),
      new PolicyStatement({
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["execute-api:Invoke"],
        resources: ["execute-api:/*"],
        conditions: { NotIpAddress: { "aws:SourceIp": allowedIps } },
      }),
    ],
  });
}

function createCorsOptions(
  corsOptions: SecureRestApiProps["corsOptions"]
): CorsOptions {
  return {
    allowOrigins: corsOptions?.allowOrigins ?? Cors.ALL_ORIGINS,
    allowMethods: ["GET", "OPTIONS", ...(corsOptions?.additionalMethods ?? [])],
    allowHeaders: [
      "Content-Type",
      "X-Api-Key",
      ...(corsOptions?.additionalHeaders ?? []),
    ],
  };
}

function createApi(scope: Construct, props: SecureRestApiProps): RestApi {
  const { apiName, description, corsOptions, deployOptions, allowedIps } =
    props;

  return new RestApi(scope, "Api", {
    restApiName: apiName,
    description: description ?? `REST API for ${apiName} service`,
    deployOptions,
    policy: allowedIps && createIpAllowlistPolicy(allowedIps),
    defaultCorsPreflightOptions: createCorsOptions(corsOptions),
  });
}

function registerRoute(api: RestApi, route: SecureRestApiRoute): void {
  const paths = [route.path, ...(route.aliasPaths ?? [])];
  for (const path of paths) {
    const resource = api.root.resourceForPath(path.replace(/^\//, ""));
    for (const method of route.methods) {
      resource.addMethod(method, route.integration, { apiKeyRequired: true });
    }
  }
}

export class SecureRestApi extends Construct {
  public readonly api: RestApi;
  public readonly apiKey: ApiKey;
  public readonly usagePlan: UsagePlan;

  constructor(scope: Construct, id: string, props: SecureRestApiProps) {
    super(scope, id);

    if (props.allowedIps) validateAllowedIps(props.allowedIps);

    this.api = createApi(this, props);
    props.routes.forEach(route => registerRoute(this.api, route));

    this.apiKey = this.createApiKey(props);
    this.usagePlan = this.createUsagePlan(props, this.api, this.apiKey);
  }

  private createApiKey({ apiName, apiKeyName }: SecureRestApiProps): ApiKey {
    return new ApiKey(this, "ApiKey", {
      description: `API Key for ${apiName} service`,
      apiKeyName: apiKeyName ?? `${apiName}-api-key`,
    });
  }

  private createUsagePlan(
    {
      apiName,
      usagePlanName,
      throttle = { rateLimit: 100, burstLimit: 200 },
    }: SecureRestApiProps,
    api: RestApi,
    apiKey: ApiKey
  ): UsagePlan {
    const usagePlan = new UsagePlan(this, "UsagePlan", {
      name: usagePlanName ?? `${apiName}-usage-plan`,
      description: `Usage plan for ${apiName} service`,
      throttle,
    });
    usagePlan.addApiStage({ api, stage: api.deploymentStage });
    usagePlan.addApiKey(apiKey);
    return usagePlan;
  }
}
