import { Construct } from 'constructs';
import { Bundling } from 'aws-cdk-lib/aws-lambda-nodejs/lib/bundling';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { experimental } from 'aws-cdk-lib/aws-cloudfront';
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";

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
                entry: `${__dirname}/handlers/error-response.ts`,
                runtime: Runtime.NODEJS_12_X,
                sourceMap: true,
                projectRoot: `${__dirname}/handlers/`,
                depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
                // Define options replace values at build time so we can use environment variables to test locally
                // and replace during build/deploy with static values. This gets around the lambda@edge limitation
                // of no environment variables at runtime.
                define: {
                  'process.env.PATH_PREFIX': JSON.stringify(options.pathPrefix ?? ''),
                },
                architecture: Architecture.X86_64
              }),
              runtime: Runtime.NODEJS_12_X,
              handler: 'index.handler',
            }
          );
    }
}
