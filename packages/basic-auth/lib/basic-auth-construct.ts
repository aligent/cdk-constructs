import { Construct } from "@aws-cdk/core";
import { Bundling } from '@aws-cdk/aws-lambda-nodejs/lib/bundling';
import { Runtime } from '@aws-cdk/aws-lambda';
import { experimental } from '@aws-cdk/aws-cloudfront';
import { EdgeFunction } from "@aws-cdk/aws-cloudfront/lib/experimental";

export interface BasicAuthFunctionOptions {
    username: string,
    password: string,
}

export class BasicAuthFunction extends Construct {
    readonly edgeFunction: EdgeFunction;

    constructor(scope: Construct, id: string, options: BasicAuthFunctionOptions) {
        super(scope, id);

        this.edgeFunction = new experimental.EdgeFunction(
            this,
            'BasicAuthFunction',
            {
              code: Bundling.bundle({
                entry: `${__dirname}/handlers/basic-auth.ts`,
                runtime: Runtime.NODEJS_12_X,
                sourceMap: true,
                projectRoot: `${__dirname}/handlers/`,
                depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
                // Define options replace values at build time so we can use environment variables to test locally
                // and replace during build/deploy with static values. This gets around the lambda@edge limitation
                // of no environment variables at runtime.
                define: {
                  'process.env.AUTH_USERNAME': JSON.stringify(options.username),
                  'process.env.AUTH_PASSWORD': JSON.stringify(options.password),
                }
              }),
              runtime: Runtime.NODEJS_12_X,
              handler: 'index.handler',
            }
          );
    }
}
