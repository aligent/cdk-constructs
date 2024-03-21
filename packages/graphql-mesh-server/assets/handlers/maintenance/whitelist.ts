import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getFileContents, setFileContents, updateFileContents } from "./lib/file";

const MAINTENANCE_FILE_PATH = process.env.MAINTENANCE_FILE_PATH;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (!MAINTENANCE_FILE_PATH) throw new Error("a");
  let body = "Method not implemented";
  let status = 200;

  switch (event.httpMethod) {
    case "GET":
      body = getFileContents();
      break;
    case "PUT":
      setFileContents(event.body || '')
      body = 'Successfully updated whitelist'
      break;
    case "PATCH":
      updateFileContents(event.body || '')
      body = 'Successfully updated whitelist'
      break;
    default:
      status = 501;
  }

  return {
    body: body,
    statusCode: status,
  };
};
