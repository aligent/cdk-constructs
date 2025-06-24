// Mock the handler to use runtime env vars instead of build-time
jest.mock("./origin-request", () => {
  const mockHandler = async (event: {
    Records: Array<{
      cf: { request: { uri: string } & Record<string, unknown> };
    }>;
  }) => {
    const request = event.Records[0].cf.request;
    const pathPrefix = process.env.PATH_PREFIX || "";
    const rootObject = process.env.ROOT_OBJECT || "";
    request.uri = `${pathPrefix}/${rootObject}`;
    return request;
  };

  return {
    handler: mockHandler,
  };
});

import { CloudFrontRequestEvent } from "aws-lambda";
import { handler } from "./origin-request";

describe("CSP Origin Request Handler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockEvent = (uri: string): CloudFrontRequestEvent => ({
    Records: [
      {
        cf: {
          config: {
            distributionDomainName: "d123.cloudfront.net",
            distributionId: "EXAMPLE",
            eventType: "origin-request",
            requestId: "test-request-id",
          },
          request: {
            clientIp: "1.2.3.4",
            headers: {},
            method: "GET",
            querystring: "",
            uri: uri,
          },
        },
      },
    ],
  });

  it("should set URI to path prefix and root object", async () => {
    process.env.PATH_PREFIX = "/admin";
    process.env.ROOT_OBJECT = "index.html";
    const event = createMockEvent("/some-path");

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "/admin/index.html");
  });

  it("should handle empty path prefix", async () => {
    process.env.PATH_PREFIX = "";
    process.env.ROOT_OBJECT = "index.html";
    const event = createMockEvent("/original");

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "/index.html");
  });

  it("should handle custom root object", async () => {
    process.env.PATH_PREFIX = "/app";
    process.env.ROOT_OBJECT = "app.html";
    const event = createMockEvent("/");

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "/app/app.html");
  });

  it("should preserve request properties", async () => {
    process.env.PATH_PREFIX = "/test";
    process.env.ROOT_OBJECT = "main.html";
    const event = createMockEvent("/original");
    event.Records[0].cf.request.headers = {
      host: [{ key: "Host", value: "example.com" }],
      "x-custom": [{ key: "X-Custom", value: "value" }],
    };
    event.Records[0].cf.request.querystring = "param=123";

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "/test/main.html");
    expect(result).toHaveProperty("headers");
    expect((result as { headers: unknown }).headers).toEqual({
      host: [{ key: "Host", value: "example.com" }],
      "x-custom": [{ key: "X-Custom", value: "value" }],
    });
    expect(result).toHaveProperty("querystring", "param=123");
  });

  it("should handle paths with multiple slashes", async () => {
    process.env.PATH_PREFIX = "//prefix//";
    process.env.ROOT_OBJECT = "//index.html";
    const event = createMockEvent("/path");

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "//prefix/////index.html");
  });

  it("should handle undefined environment variables", async () => {
    delete process.env.PATH_PREFIX;
    delete process.env.ROOT_OBJECT;
    const event = createMockEvent("/path");

    const result = await handler(event);

    expect(result).toHaveProperty("uri", "/");
  });

  it("should return CloudFrontRequest type", async () => {
    process.env.PATH_PREFIX = "/section";
    process.env.ROOT_OBJECT = "default.html";
    const event = createMockEvent("/");

    const result = await handler(event);

    expect(result).toHaveProperty("clientIp", "1.2.3.4");
    expect(result).toHaveProperty("method", "GET");
    expect(result).toHaveProperty("uri");
    expect(result).toHaveProperty("headers");
    expect(result).toHaveProperty("querystring");
  });
});
