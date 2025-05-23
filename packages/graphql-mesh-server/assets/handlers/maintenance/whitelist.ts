import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  getMaintenanceFile,
  setWhitelist,
  updateWhitelist,
} from "./lib/file";

const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH;

interface WhitelistRequest {
  whitelist: Array<string>;
}

interface WhitelistResponse {
  whitelist: Array<string>;
}

interface WhitelistErrorResponse {
  error: string;
}

const parseBody = function (body: string|null): WhitelistRequest {
  if (!body) {
    throw new Error('Update requests must contain a JSON body.');
  }

  let whitelistRequest = JSON.parse(body);
  
  if (!('whitelist' in whitelistRequest) || !Array.isArray(whitelistRequest.whitelist)) {
      throw new Error('Update requests must contain an array of whitelisted IP addresses.');
  }

  return whitelistRequest;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!MAINTENANCE_FILE_PATH) throw new Error("Maintenance File path is missing.");

  let status = 501;
  let response: WhitelistErrorResponse|WhitelistResponse = {
    error: "Method not implemented"
  };

  try {
    switch (event.httpMethod) {
      case "GET":
        status = 200
        response = {
          whitelist: getMaintenanceFile().whitelist
        }
        break;
      case "PUT":
        let replaceBody = parseBody(event.body);
        setWhitelist(replaceBody.whitelist);
        status = 200
        response = {
          whitelist: getMaintenanceFile().whitelist
        }
        break;
      case "PATCH":
        let updateBody = parseBody(event.body);
        updateWhitelist(updateBody.whitelist);
        status = 200
        response = {
          whitelist: getMaintenanceFile().whitelist
        }
        break;
      default:
        throw new Error(`Received ${event.httpMethod}, with body ${event.body}.`)
    }
  } catch (error) {
    if (error instanceof Error) {
      status = 403;
      response = {
        error: error.message
      }
    } else {
      response = {
        error: 'An unknown error ocurred.'
      }
    }
  }

  return {
    body: JSON.stringify(response),
    statusCode: status,
    headers: {
      'content-type': 'application/json'
    }
  };
};
