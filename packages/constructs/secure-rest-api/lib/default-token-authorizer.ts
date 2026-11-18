import { Esbuild } from "@aligent/cdk-esbuild";
import { AssetHashType, Duration, DockerImage } from "aws-cdk-lib";
import { TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { join } from "node:path";

const DEFAULT_CACHE_TTL = Duration.seconds(60);
const TOKEN_LENGTH = 64;

export interface DefaultTokenAuthorizer {
  authorizer: TokenAuthorizer;
  secret: ISecret;
}

function createTokenSecret(scope: Construct): Secret {
  return new Secret(scope, "TokenSecret", {
    description: "Bearer token accepted by the API's default authorizer",
    generateSecretString: {
      passwordLength: TOKEN_LENGTH,
      excludePunctuation: true,
    },
  });
}

function createAuthorizerFunction(
  scope: Construct,
  secret: ISecret
): LambdaFunction {
  const handlersDir = join(__dirname, "handlers");
  const fn = new LambdaFunction(scope, "TokenAuthorizerFunction", {
    runtime: Runtime.NODEJS_24_X,
    handler: "token-authorizer.handler",
    code: Code.fromAsset(handlersDir, {
      assetHashType: AssetHashType.OUTPUT,
      bundling: {
        command: [
          "sh",
          "-c",
          'echo "Docker build not supported. Please install esbuild."',
        ],
        image: DockerImage.fromRegistry("busybox"),
        local: new Esbuild({
          entryPoints: [join(handlersDir, "token-authorizer.ts")],
        }),
      },
    }),
    environment: { SECRET_ARN: secret.secretArn },
  });
  secret.grantRead(fn);
  return fn;
}

export interface DefaultTokenAuthorizerOptions {
  authorizerCacheTtl?: Duration;
}

export function createDefaultTokenAuthorizer(
  scope: Construct,
  options: DefaultTokenAuthorizerOptions
): DefaultTokenAuthorizer {
  const secret = createTokenSecret(scope);
  const authorizer = new TokenAuthorizer(scope, "TokenAuthorizer", {
    handler: createAuthorizerFunction(scope, secret),
    identitySource: "method.request.header.Authorization",
    resultsCacheTtl: options.authorizerCacheTtl ?? DEFAULT_CACHE_TTL,
  });
  return { authorizer, secret };
}
