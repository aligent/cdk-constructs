import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { existsSync, renameSync, writeFileSync } from "node:fs";

const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!MAINTENANCE_FILE_PATH) throw new Error("a");
  let body = "Method not implemented";
  let status = 200;

  switch (event.httpMethod) {
    case "GET":
      body = String(getMaintenanceStatus(MAINTENANCE_FILE_PATH));
      break;
    case "POST":
      body = String(
        changeMaintenanceStatus(
          MAINTENANCE_FILE_PATH,
          extractDesiredStatusFromEvent(event)
        )
      );
      break;
    default:
      status = 501;
  }

  return {
    body: body,
    statusCode: status,
  };
};

const getMaintenanceStatus = (filePath: string): boolean => {
  return existsSync(`${filePath}/maintenance.enabled`);
};

const extractDesiredStatusFromEvent = (
  event: APIGatewayProxyEvent
): boolean | undefined => {
  if (event.resource.includes("enable")) return true;
  if (event.resource.includes("disable")) return false;
  return undefined;
};

const changeMaintenanceStatus = (
  filePath: string,
  desiredStatus?: boolean
): boolean => {
  // If no status is provided then toggle
  if (desiredStatus === undefined) return toggleMaintenanceStatus(filePath);

  const maintenanceEnabled = getMaintenanceStatus(filePath);
  if (maintenanceEnabled === desiredStatus) return desiredStatus;

  return toggleMaintenanceStatus(filePath);
};

const toggleMaintenanceStatus = (filePath: string) => {
  const maintenanceEnabled = getMaintenanceStatus(filePath);

  const currentStatus = maintenanceEnabled ? "enabled" : "disabled";
  const desiredStatus = maintenanceEnabled ? "disabled" : "enabled";

  if (existsSync(`${filePath}/maintenance.${desiredStatus}`))
    return !maintenanceEnabled;

  if (existsSync(`${filePath}/maintenance.${currentStatus}`)) {
    renameSync(
      `${filePath}/maintenance.${currentStatus}`,
      `${filePath}/maintenance.${desiredStatus}`
    );
    return !maintenanceEnabled;
  }

  writeFileSync(`${filePath}/maintenance.${desiredStatus}`, "");
  return !maintenanceEnabled;
};
