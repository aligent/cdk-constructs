import middy from "@middy/core";
import { PrerenderCacheControlHandler } from "@aligent/cdk-lambda-at-edge-handlers";

/**
 * Prerender Cache Control Handler
 * @link https://github.com/aligent/cdk-constructs/blob/main/packages/lambda-at-edge-handlers/lib/cache-control.ts
 */
export const handler = middy(PrerenderCacheControlHandler);