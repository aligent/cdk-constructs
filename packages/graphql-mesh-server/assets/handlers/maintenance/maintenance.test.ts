// handler.test.ts
import { cwd } from "process";
import { handler } from "./maintenance";
import { APIGatewayProxyEvent } from "aws-lambda";
import { updateMaintenanceStatus } from "./lib/file";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestContext: {} as any,
  resource: "/",
});
const mockSites = { "example.com": false, "example.com.au": false };

describe("Lambda handler", () => {
  beforeEach(() => {
    // Clean up any existing maintenance files before each test
    if (existsSync(`${cwd()}/maintenance.enabled`)) {
      rmSync(`${cwd()}/maintenance.enabled`);
    }
    if (existsSync(`${cwd()}/maintenance.disabled`)) {
      rmSync(`${cwd()}/maintenance.disabled`);
    }
    // Reset the maintenance status before each test to ensure test isolation
    updateMaintenanceStatus(mockSites);
  });

  it("should handle GET method", async () => {
    const event = createMockEvent("GET");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ sites: mockSites });
  });

  it("should handle POST'ing a enable single site", async () => {
    const mockUpdate = {
      sites: { "example.com": false, "example.com.au": true },
    };
    const event = createMockEvent("POST", JSON.stringify(mockUpdate));
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(mockUpdate);
    expect(existsSync(`${cwd()}/maintenance.enabled`)).toBe(true);
  });

  it("should handle POST'ing a disable all sites", async () => {
    // First enable a site to set up the required state
    const enableUpdate = {
      sites: { "example.com": false, "example.com.au": true },
    };
    const enableEvent = createMockEvent("POST", JSON.stringify(enableUpdate));
    await handler(enableEvent);

    // Verify the file is in enabled state as expected
    expect(existsSync(`${cwd()}/maintenance.enabled`)).toBe(true);

    // Now test disabling all sites
    const mockUpdate = {
      sites: { "example.com": false, "example.com.au": false },
    };
    const event = createMockEvent("POST", JSON.stringify(mockUpdate));
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(mockUpdate);
    expect(existsSync(`${cwd()}/maintenance.disabled`)).toBe(true);
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
