import middy from "@middy/core";
import { PrerenderErrorResponseHandler } from "@aligent/cdk-lambda-at-edge-handlers";

/**
 * Prerender Error ResponseHandler
 * @link https://github.com/aligent/cdk-constructs/blob/main/packages/lambda-at-edge-handlers/lib/error-response.ts
 */
export const handler = middy(PrerenderErrorResponseHandler);