import {
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontResponse,
} from "aws-lambda";
import "source-map-support/register";

const PATH_PREFIX = process.env.PATH_PREFIX;
const ROOT_OBJECT = process.env.ROOT_OBJECT;

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontResponse | CloudFrontRequest> => {
  const request = event.Records[0].cf.request;

  // Override root object
  request.uri = `${PATH_PREFIX}/${ROOT_OBJECT}`;

  return request;
};
