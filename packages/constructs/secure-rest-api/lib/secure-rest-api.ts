import { Duration } from "aws-cdk-lib";
import {
  AuthorizationType,
  Cors,
  CorsOptions,
  IAuthorizer,
  Integration,
  MethodOptions,
  RestApi,
  StageOptions,
} from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import {
  AnyPrincipal,
  Effect,
  PolicyDocument,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { isIPv4, isIPv6 } from "node:net";
import { createDefaultTokenAuthorizer } from "./default-token-authorizer";

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

  /**
   * Overrides the API-level authorizer for this route and its alias paths.
   *
   * Pass `AuthorizationType.NONE` to make the route fully public: no other
   * control gates it, so use it only for routes that verify callers another
   * way (e.g. health checks or signature-verified webhooks).
   * @default the API-level authorizer
   */
  authorizer?: IAuthorizer | AuthorizationType.NONE;
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
   * (GET/OPTIONS and Content-Type/Authorization respectively).
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
   * Authorizer applied to every route, replacing the default token authorizer
   * (e.g. a Cognito or custom Lambda authorizer).
   *
   * When set, the construct creates no authorizer Lambda or secret and
   * `secret` is `undefined`.
   * @default a Lambda TOKEN authorizer validating a bearer token held in a generated secret
   */
  authorizer?: IAuthorizer;

  /**
   * Secrets Manager secret holding the token accepted by the default
   * authorizer. It must contain the token as a plain string, not JSON.
   *
   * When set, the construct generates no secret and the authorizer reads this
   * one. Cannot be combined with a custom `authorizer`.
   * @default a secret with a generated token
   */
  secret?: ISecret;

  /**
   * How long API Gateway caches the default authorizer's decision for a token.
   *
   * A revoked token can remain valid for up to this long. Cannot be combined
   * with a custom `authorizer`.
   * @default Duration.seconds(60)
   */
  authorizerCacheTtl?: Duration;

  /**
   * Stage options for the API's default deployment.
   *
   * Use `stageName` to override the deployed stage name.
   * @default stageName "prod" (CDK default)
   */
  deployOptions?: StageOptions;

  /**
   * Stage-level throttling limits applied to every method.
   *
   * Explicit `throttlingRateLimit` / `throttlingBurstLimit` in `deployOptions`
   * take precedence over the matching value here.
   * @default { rateLimit: 100, burstLimit: 200 }
   */
  throttle?: {
    rateLimit: number;
    burstLimit: number;
  };

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

const DEFAULT_THROTTLE = { rateLimit: 100, burstLimit: 200 };

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

function validateDefaultAuthorizerProps({
  authorizer,
  secret,
  authorizerCacheTtl,
}: SecureRestApiProps): void {
  if (!authorizer) return;

  const ignored = Object.entries({ secret, authorizerCacheTtl })
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  if (ignored.length > 0) {
    throw new Error(
      `${ignored.join(", ")} only configure the default authorizer and cannot be combined with a custom authorizer`
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
      "Authorization",
      ...(corsOptions?.additionalHeaders ?? []),
    ],
  };
}

function createDeployOptions({
  throttle = DEFAULT_THROTTLE,
  deployOptions,
}: SecureRestApiProps): StageOptions {
  return {
    ...deployOptions,
    throttlingRateLimit:
      deployOptions?.throttlingRateLimit ?? throttle.rateLimit,
    throttlingBurstLimit:
      deployOptions?.throttlingBurstLimit ?? throttle.burstLimit,
  };
}

function createApi(scope: Construct, props: SecureRestApiProps): RestApi {
  const { apiName, description, corsOptions, allowedIps } = props;

  return new RestApi(scope, "Api", {
    restApiName: apiName,
    description: description ?? `REST API for ${apiName} service`,
    deployOptions: createDeployOptions(props),
    policy: allowedIps && createIpAllowlistPolicy(allowedIps),
    defaultCorsPreflightOptions: createCorsOptions(corsOptions),
  });
}

function createMethodOptions(
  routeAuthorizer: SecureRestApiRoute["authorizer"],
  apiAuthorizer: IAuthorizer
): MethodOptions {
  if (routeAuthorizer === AuthorizationType.NONE) {
    return { authorizationType: AuthorizationType.NONE };
  }
  return { authorizer: routeAuthorizer ?? apiAuthorizer };
}

function registerRoute(
  api: RestApi,
  route: SecureRestApiRoute,
  apiAuthorizer: IAuthorizer
): void {
  const methodOptions = createMethodOptions(route.authorizer, apiAuthorizer);
  const paths = [route.path, ...(route.aliasPaths ?? [])];
  for (const path of paths) {
    const resource = api.root.resourceForPath(path.replace(/^\//, ""));
    for (const method of route.methods) {
      resource.addMethod(method, route.integration, methodOptions);
    }
  }
}

export class SecureRestApi extends Construct {
  public readonly api: RestApi;

  /**
   * The Secrets Manager secret holding the bearer token accepted by the
   * default authorizer. `undefined` when a custom `authorizer` is supplied.
   */
  public readonly secret?: ISecret;

  constructor(scope: Construct, id: string, props: SecureRestApiProps) {
    super(scope, id);

    if (props.allowedIps) validateAllowedIps(props.allowedIps);
    validateDefaultAuthorizerProps(props);

    let authorizer = props.authorizer;
    if (!authorizer) {
      const defaultAuthorizer = createDefaultTokenAuthorizer(this, props);
      authorizer = defaultAuthorizer.authorizer;
      this.secret = defaultAuthorizer.secret;
    }

    this.api = createApi(this, props);
    props.routes.forEach(route => registerRoute(this.api, route, authorizer));
  }
}
