import middy from "@middy/core";
import { PrerenderErrorResponseHandler } from "@aligent/cdk-lambda-at-edge-handlers";

export const handler = middy(PrerenderErrorResponseHandler);