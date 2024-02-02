import { CloudFrontRequestEvent, CloudFrontRequest } from "aws-lambda";
import "source-map-support/register";

const RETURN_INDEX = /(^.\w*$)|(\/$)|(\.html$)/i;

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequest> => {
  const { request } = event.Records[0].cf;

  const host = request.headers["x-forwarded-host"][0].value;
  const matches = host.match(/^([^.]+)/);

  if (matches) {
    const branch = matches.pop();
    if (request.origin?.s3) {
      request.origin.s3.path = `/${branch}`;
    }
  }

  if (RETURN_INDEX.test(request.uri)) {
    request.uri = "/index.html";
  }

  return request;
};
