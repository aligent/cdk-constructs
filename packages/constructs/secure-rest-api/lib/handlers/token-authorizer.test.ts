import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
} from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";

const SECRET_ARN =
  "arn:aws:secretsmanager:ap-southeast-2:123456789012:secret:token";
const METHOD_ARN =
  "arn:aws:execute-api:ap-southeast-2:123456789012:abc123/prod/GET/items/42";
const CURRENT_TOKEN = "current-token-value";

const secretsMock = mockClient(SecretsManagerClient);

const eventWith = (
  authorizationToken: string
): APIGatewayTokenAuthorizerEvent => ({
  type: "TOKEN",
  methodArn: METHOD_ARN,
  authorizationToken,
});

// API Gateway omits the property entirely when the header is absent, which the event type cannot express.
const eventWithoutHeader = () =>
  ({ type: "TOKEN", methodArn: METHOD_ARN }) as APIGatewayTokenAuthorizerEvent;

const effectOf = (result: APIGatewayAuthorizerResult) =>
  result.policyDocument.Statement[0].Effect;

describe("token authorizer handler", () => {
  let handler: typeof import("./token-authorizer").handler;

  beforeEach(async () => {
    process.env.SECRET_ARN = SECRET_ARN;
    secretsMock.reset();
    secretsMock
      .on(GetSecretValueCommand, { SecretId: SECRET_ARN })
      .resolves({ SecretString: CURRENT_TOKEN });
    ({ handler } = await import("./token-authorizer"));
  });

  it("allows a valid bearer token", async () => {
    const result = await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));

    expect(effectOf(result)).toBe("Allow");
  });

  it("applies the decision to every method on the API so cached decisions cover all routes", async () => {
    const result = await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));

    expect(result.policyDocument.Statement).toEqual([
      expect.objectContaining({
        Resource:
          "arn:aws:execute-api:ap-southeast-2:123456789012:abc123/prod/*/*",
      }),
    ]);
  });

  it("denies a wrong token", async () => {
    const result = await handler(eventWith("Bearer wrong-token"));

    expect(effectOf(result)).toBe("Deny");
  });

  it("denies the previous secret version's token after rotation", async () => {
    secretsMock
      .on(GetSecretValueCommand, { SecretId: SECRET_ARN })
      .resolves({ SecretString: "rotated-token-value" });

    const result = await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));

    expect(effectOf(result)).toBe("Deny");
  });

  it("reads the secret on every invocation", async () => {
    await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));
    await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));

    expect(secretsMock.commandCalls(GetSecretValueCommand)).toHaveLength(2);
  });

  it("reads the current secret version rather than a pinned one", async () => {
    await handler(eventWith(`Bearer ${CURRENT_TOKEN}`));

    const [call] = secretsMock.commandCalls(GetSecretValueCommand);
    expect(call.args[0].input).toEqual({ SecretId: SECRET_ARN });
  });

  it("rejects a missing header with Unauthorized", async () => {
    await expect(handler(eventWithoutHeader())).rejects.toThrow("Unauthorized");
  });

  it.each([
    ["an empty header", ""],
    ["a non-Bearer scheme", `Basic ${CURRENT_TOKEN}`],
    ["a bare token with no scheme", CURRENT_TOKEN],
    ["a Bearer scheme with no token", "Bearer "],
  ])("rejects %s with Unauthorized", async (_label, header) => {
    await expect(handler(eventWith(header))).rejects.toThrow("Unauthorized");
  });

  it("denies a token that is a prefix of the secret", async () => {
    const result = await handler(
      eventWith(`Bearer ${CURRENT_TOKEN.slice(0, -1)}`)
    );

    expect(effectOf(result)).toBe("Deny");
  });

  it("denies a token that extends the secret", async () => {
    const result = await handler(eventWith(`Bearer ${CURRENT_TOKEN}extra`));

    expect(effectOf(result)).toBe("Deny");
  });

  it("fails closed when the secret cannot be read", async () => {
    secretsMock
      .on(GetSecretValueCommand, { SecretId: SECRET_ARN })
      .rejects(new Error("AccessDenied"));

    await expect(
      handler(eventWith(`Bearer ${CURRENT_TOKEN}`))
    ).rejects.toThrow();
  });

  it("fails closed when the secret has no string value", async () => {
    secretsMock
      .on(GetSecretValueCommand, { SecretId: SECRET_ARN })
      .resolves({ SecretBinary: new Uint8Array([1, 2, 3]) });

    await expect(
      handler(eventWith(`Bearer ${CURRENT_TOKEN}`))
    ).rejects.toThrow();
  });
});
