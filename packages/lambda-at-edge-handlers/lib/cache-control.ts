import "source-map-support/register";
import { CloudFrontResponseEvent, CloudFrontResponse } from "aws-lambda";
/*  
    Prerender cache control function 
    Consider associate this function as *origin response* function
*/
export const handler = async (
  event: CloudFrontResponseEvent
): Promise<CloudFrontResponse> => {
  const cacheKey = process.env.PRERENDER_CACHE_KEY || "x-prerender-requestid";
  const cacheMaxAge = process.env.PRERENDER_CACHE_MAX_AGE || "0";
  const response = event.Records[0].cf.response;

  if (response.headers[`${cacheKey}`]) {
    response.headers["Cache-Control"] = [
      {
        key: "Cache-Control",
        value: `max-age=${cacheMaxAge}`,
      },
    ];
  }
  return response;
};
