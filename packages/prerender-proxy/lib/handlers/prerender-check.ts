import middy from "@middy/core";
import { PrerenderCheckHandler } from "@aligent/cdk-lambda-at-edge-handlers";

export const handler = middy(PrerenderCheckHandler);