import "source-map-support/register";
import { CloudFrontRequestEvent, CloudFrontRequest } from "aws-lambda";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const REMAP_PATH = process.env.REMAP_PATH!;

// Lambda handler for replacing the path of a request with another
export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequest> => {
  const request = event.Records[0].cf.request;

  request.uri = REMAP_PATH;

  return request;
};
