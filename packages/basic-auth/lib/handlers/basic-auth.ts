import "source-map-support/register";
import {
  CloudFrontRequestEvent,
  CloudFrontResponse,
  CloudFrontRequest,
} from "aws-lambda";

const AUTH_USERNAME = process.env.AUTH_USERNAME;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
const authString =
  "Basic " +
  Buffer.from(AUTH_USERNAME + ":" + AUTH_PASSWORD, "binary").toString("base64");

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequest | CloudFrontResponse> => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  // Require Basic authentication
  if (
    typeof headers.authorization == "undefined" ||
    headers.authorization[0].value != authString
  ) {
    const body = "Unauthorized";
    const response = {
      status: "401",
      statusDescription: "Unauthorized",
      body: body,
      headers: {
        "www-authenticate": [{ key: "WWW-Authenticate", value: "Basic" }],
      },
    };
    return response;
  }

  return request;
};
