import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getCurrentStatus, toggleMaintenanceStatus } from "./lib/file";

const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!MAINTENANCE_FILE_PATH) throw new Error("a");
  let body = "Method not implemented";
  let status = 200;

  switch (event.httpMethod) {
    case "GET":
      body = getCurrentStatus();
      break;
    case "POST":
      body = changeMaintenanceStatus(extractDesiredStatusFromEvent(event));
      break;
    default:
      status = 501;
  }

  return {
    body: body,
    statusCode: status,
  };
};
const extractDesiredStatusFromEvent = (
  event: APIGatewayProxyEvent
): "enabled" | "disabled" | undefined => {
  if (event.resource.includes("enable")) return "enabled";
  if (event.resource.includes("disable")) return "disabled";
  return undefined;
};

const changeMaintenanceStatus = (
  desiredStatus?: "enabled" | "disabled"
): string => {
  // If no status is provided then toggle
  if (desiredStatus === undefined) {
    toggleMaintenanceStatus();
    return getCurrentStatus();
  }

  const currentStatus = getCurrentStatus();
  if (currentStatus === desiredStatus) return currentStatus;

  toggleMaintenanceStatus();
  return getCurrentStatus();
};
