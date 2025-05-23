// handler.test.ts
import { cwd } from "process";
import { handler } from "./whitelist";
import { APIGatewayProxyEvent } from "aws-lambda";
import { setWhitelist } from "./lib/file";
import { existsSync, rmSync } from "fs";

const createMockEvent = (
  method: string,
  body?: string
): APIGatewayProxyEvent => ({
  body: body || null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: method,
  isBase64Encoded: false,
  path: "/",
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {} as any,
  resource: "/",
});
const mockAllowlist = [
  // IPv4 Addresses
  "127.0.0.1", // Loopback
  "192.168.0.1", // Private network
  "10.0.0.1", // Private network
  "172.16.0.1", // Private network (Class B range)
  "8.8.8.8", // Google DNS
  "0.0.0.0", // Non-routable meta-address

  // IPv6 Addresses
  "::1", // Loopback
  "2001:0db8::1", // Documentation/test address
  "fe80::1", // Link-local address
  "fd00::1", // Unique local address
  "::", // Unspecified address
  "2001:4860:4860::8888", // Google DNS IPv6
];
describe("Lambda handler", () => {
  beforeAll(() => {
    setWhitelist(mockAllowlist);
  });

  it("should handle GET method", async () => {
    const event = createMockEvent("GET");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ whitelist: mockAllowlist });
  });

  it("should handle PATCH method with body", async () => {
    const newIp = "1.1.1.1";
    const body = JSON.stringify({ whitelist: [newIp] });
    const event = createMockEvent("PATCH", body);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      whitelist: mockAllowlist.concat([newIp]),
    });
  });

  it("should handle PUT method with body", async () => {
    const body = JSON.stringify({ whitelist: ["127.0.0.1"] });
    const event = createMockEvent("PUT", body);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ whitelist: ["127.0.0.1"] });
  });

  it("should return 501 for unsupported methods", async () => {
    const event = createMockEvent("DELETE");
    const result = await handler(event);
    expect(result.statusCode).toBe(501);
  });

  it("should return 403 for invalid ips", async () => {
    const newIp = "192.168.1.999";
    const body = JSON.stringify({ whitelist: [newIp] });
    const event = createMockEvent("PATCH", body);
    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      error: "List of IP addresses is not valid",
    });
  });

  afterAll(() => {
    if (existsSync(`${cwd()}/maintenance.enabled`)) {
      rmSync(`${cwd()}/maintenance.enabled`);
    }

    if (existsSync(`${cwd()}/maintenance.disabled`)) {
      rmSync(`${cwd()}/maintenance.disabled`);
    }
  });
});
