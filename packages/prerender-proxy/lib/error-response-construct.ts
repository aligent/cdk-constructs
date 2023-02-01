import { Construct } from "@aws-cdk/core";
import { Bundling } from '@aws-cdk/aws-lambda-nodejs/lib/bundling';
import { Runtime } from '@aws-cdk/aws-lambda';
import { experimental } from '@aws-cdk/aws-cloudfront';
import { EdgeFunction } from "@aws-cdk/aws-cloudfront/lib/experimental";
import "@aligent/cdk-lambda-at-edge-handlers"

export interface ErrorResponseFunctionOptions {
    pathPrefix?: string
}

export class ErrorResponseFunction extends Construct {
    readonly edgeFunction: EdgeFunction;

    constructor(scope: Construct, id: string, options: ErrorResponseFunctionOptions) {
        super(scope, id);

        this.edgeFunction = new experimental.EdgeFunction(
            this,
            'ErrorResponseFunction',
            {
              code: Bundling.bundle({
                entry: `${__dirname}/node_modules/@aligent/cdk-lambda-at-edge-handlers/lib/error-response.js`,
                runtime: Runtime.NODEJS_14_X,
                sourceMap: true,
                projectRoot: `${__dirname}/node_modules/@aligent/cdk-lambda-at-edge-handlers/`,
                depsLockFilePath: `${__dirname}/node_modules/@aligent/cdk-lambda-at-edge-handlers/package-lock.json`,
                // Define options replace values at build time so we can use environment variables to test locally
                // and replace during build/deploy with static values. This gets around the lambda@edge limitation
                // of no environment variables at runtime.
                define: {
                  'process.env.PATH_PREFIX': JSON.stringify(options.pathPrefix ?? ''),
                }
              } as any),
              runtime: Runtime.NODEJS_14_X,
              handler: 'index.handler',
            }
          );
    }
}
