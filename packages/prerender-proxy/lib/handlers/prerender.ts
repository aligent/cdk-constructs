import middy from "@middy/core";
import { PrerenderHandler } from "@aligent/cdk-lambda-at-edge-handlers";

/**
 * Prerender Handler
 * @link https://github.com/aligent/cdk-constructs/blob/main/packages/lambda-at-edge-handlers/lib/prerender.ts
 */
export const handler = middy(PrerenderHandler);