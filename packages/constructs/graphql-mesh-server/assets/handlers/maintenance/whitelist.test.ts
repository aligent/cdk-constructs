// handler.test.ts
import { handler } from "./whitelist";
import { APIGatewayProxyEvent } from "aws-lambda";
import { setWhitelist } from "./lib/file";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Each suite owns an isolated directory so parallel suites can't race on a
// shared maintenance file (see lib/file.ts MAINTENANCE_FILE_PATH).
const maintenanceDir = mkdtempSync(join(tmpdir(), "maint-whitelist-"));
process.env.MAINTENANCE_FILE_PATH = maintenanceDir;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  beforeEach(() => {
    // Clean up any existing maintenance files before each test
    if (existsSync(`${maintenanceDir}/maintenance.enabled`)) {
      rmSync(`${maintenanceDir}/maintenance.enabled`);
    }
    if (existsSync(`${maintenanceDir}/maintenance.disabled`)) {
      rmSync(`${maintenanceDir}/maintenance.disabled`);
    }
    // Reset the whitelist before each test to ensure test isolation
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
    rmSync(maintenanceDir, { recursive: true, force: true });
  });
});
