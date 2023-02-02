import middy from "@middy/core";
import { PrerenderCheckHandler } from "@aligent/cdk-lambda-at-edge-handlers";

/**
 * Prerender Check Handler
 * @link https://github.com/aligent/cdk-constructs/blob/main/packages/lambda-at-edge-handlers/lib/prerender-check.ts
 */
export const handler = middy(PrerenderCheckHandler);