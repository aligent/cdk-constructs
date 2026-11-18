import "source-map-support/register";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
} from "aws-lambda";
import { createHash, timingSafeEqual } from "node:crypto";

const client = new SecretsManagerClient({});
const BEARER_PREFIX = "Bearer ";

function extractBearerToken(header: string | undefined): string {
  if (!header?.startsWith(BEARER_PREFIX)) throw new Error("Unauthorized");

  const token = header.slice(BEARER_PREFIX.length);
  if (token.length === 0) throw new Error("Unauthorized");

  return token;
}

async function fetchCurrentToken(): Promise<string> {
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN })
  );
  if (!SecretString) throw new Error("Authorizer secret has no string value");

  return SecretString;
}

// Hashing first gives equal-length buffers, so neither length nor prefix leaks through timing.
function tokensMatch(presented: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

// The decision is cached per token across all methods, so it must cover the whole stage.
function stageWideResource(methodArn: string): string {
  const [apiArn, stage] = methodArn.split("/");
  return `${apiArn}/${stage}/*/*`;
}

function buildPolicy(
  effect: "Allow" | "Deny",
  methodArn: string
): APIGatewayAuthorizerResult {
  return {
    principalId: "token",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: effect,
          Resource: stageWideResource(methodArn),
        },
      ],
    },
  };
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  const presented = extractBearerToken(event.authorizationToken);
  const expected = await fetchCurrentToken();

  return buildPolicy(
    tokensMatch(presented, expected) ? "Allow" : "Deny",
    event.methodArn
  );
};
