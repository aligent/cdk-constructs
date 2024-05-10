import { CloudFrontRequest, CloudFrontRequestEvent } from "aws-lambda";
import "source-map-support/register";

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontRequest> => {
  const { request } = event.Records[0].cf;

  request.headers["x-forwarded-host"] = [
    {
      value: request.headers.host[0].value,
      key: "X-Forwarded-Host",
    },
  ];

  return request;
};
