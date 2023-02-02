import middy from "@middy/core";
import { PrerenderCacheControlHandler} from "@aligent/cdk-lambda-at-edge-handlers";

export const handler = middy(PrerenderCacheControlHandler);