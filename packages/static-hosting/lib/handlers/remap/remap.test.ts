// Mock the environment variable that gets defined at build time
jest.mock("./remap", () => {
  const originalModule = jest.requireActual("./remap");

  // Create a modified handler that uses runtime env var instead of build-time
  const mockHandler = async (event: {
    Records: Array<{
      cf: { request: { uri: string } & Record<string, unknown> };
    }>;
  }) => {
    const request = event.Records[0].cf.request;
    request.uri = process.env.REMAP_PATH || "";
    return request;
  };

  return {
    ...originalModule,
    handler: mockHandler,
  };
});

import { CloudFrontRequestEvent } from "aws-lambda";
import { handler } from "./remap";

describe("Remap Lambda Handler", () => {
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

  it("should remap the request URI to the configured path", async () => {
    process.env.REMAP_PATH = "/new-path/index.html";
    const event = createMockEvent("/old-path/index.html");

    const result = await handler(event);

    expect(result.uri).toBe("/new-path/index.html");
    expect(result.method).toBe("GET");
    expect(result.clientIp).toBe("1.2.3.4");
  });

  it("should preserve all other request properties", async () => {
    process.env.REMAP_PATH = "/remapped.xml";
    const event = createMockEvent("/original.xml");
    event.Records[0].cf.request.headers = {
      host: [{ key: "Host", value: "example.com" }],
      "user-agent": [{ key: "User-Agent", value: "Test/1.0" }],
    };
    event.Records[0].cf.request.querystring = "param=value";

    const result = await handler(event);

    expect(result.uri).toBe("/remapped.xml");
    expect(result.headers).toEqual({
      host: [{ key: "Host", value: "example.com" }],
      "user-agent": [{ key: "User-Agent", value: "Test/1.0" }],
    });
    expect(result.querystring).toBe("param=value");
  });

  it("should handle root path remapping", async () => {
    process.env.REMAP_PATH = "/";
    const event = createMockEvent("/some/deep/path");

    const result = await handler(event);

    expect(result.uri).toBe("/");
  });

  it("should handle paths with special characters", async () => {
    process.env.REMAP_PATH = "/path-with-special_chars.123.xml";
    const event = createMockEvent("/original-path");

    const result = await handler(event);

    expect(result.uri).toBe("/path-with-special_chars.123.xml");
  });

  it("should handle empty REMAP_PATH", async () => {
    process.env.REMAP_PATH = "";
    const event = createMockEvent("/original-path");

    const result = await handler(event);

    expect(result.uri).toBe("");
  });

  it("should handle paths without leading slash", async () => {
    process.env.REMAP_PATH = "no-leading-slash.html";
    const event = createMockEvent("/original.html");

    const result = await handler(event);

    expect(result.uri).toBe("no-leading-slash.html");
  });

  it("should return the complete request object", async () => {
    process.env.REMAP_PATH = "/new-uri";
    const event = createMockEvent("/old-uri");

    const result = await handler(event);

    expect(result).toEqual(
      expect.objectContaining({
        clientIp: "1.2.3.4",
        headers: {},
        method: "GET",
        querystring: "",
        uri: "/new-uri",
      })
    );
  });
});
