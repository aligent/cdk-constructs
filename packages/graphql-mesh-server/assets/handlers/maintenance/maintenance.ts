import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  getMaintenanceFile,
  toggleMaintenanceStatus,
  updateMaintenanceStatus,
} from "./lib/file";

const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH;

interface MaintenanceRequest {
  sites: Record<string, boolean>;
}

interface MaintenanceResponse {
  sites: Record<string, boolean>;
}

interface MaintenanceErrorResponse {
  error: string;
}

const parseBody = function (body: string | null): MaintenanceRequest {
  if (!body) {
    throw new Error("Update requests must contain a JSON body.");
  }

  const maintenanceRequest = JSON.parse(body);

  if (
    !("sites" in maintenanceRequest) ||
    !(typeof maintenanceRequest.sites == "object")
  ) {
    throw new Error(
      "Maintenance request updates must contain a record of which sites to place in maintenance mode."
    );
  }

  return maintenanceRequest;
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!MAINTENANCE_FILE_PATH)
    throw new Error("Maintenance File path is missing.");
  let status = 501;
  let response: MaintenanceErrorResponse | MaintenanceResponse = {
    error: "Method not implemented",
  };

  try {
    switch (event.httpMethod) {
      case "GET": {
        status = 200;
        response = {
          sites: getMaintenanceFile().sites,
        };
        break;
      }
      case "POST": {
        const maintenanceRequest = parseBody(event.body);

        // if any site is in maintenance update the file to .enabled
        const enabled = Object.values(maintenanceRequest.sites).some(
          value => value === true
        );
        toggleMaintenanceStatus(enabled);

        // Update contents of file
        updateMaintenanceStatus(maintenanceRequest.sites);
        status = 200;
        response = {
          sites: getMaintenanceFile().sites,
        };
        break;
      }
      default:
        status = 501;
    }
  } catch (error) {
    if (error instanceof Error) {
      status = 403;
      response = {
        error: error.message,
      };
    } else {
      console.error(JSON.stringify(error));
      status = 500;
      response = {
        error: "An Unkown error ocurred.",
      };
    }
  }

  return {
    body: JSON.stringify(response),
    statusCode: status,
    headers: {
      "content-type": "application/json",
    },
  };
};
