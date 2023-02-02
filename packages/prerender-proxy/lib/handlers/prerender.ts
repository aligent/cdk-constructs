import middy from "@middy/core";
import { PrerenderHandler } from "@aligent/cdk-lambda-at-edge-handlers";

export const handler = middy(PrerenderHandler);