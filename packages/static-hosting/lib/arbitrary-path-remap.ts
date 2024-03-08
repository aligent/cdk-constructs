import { Construct } from "@aws-cdk/core";
import { Bundling } from "@aws-cdk/aws-lambda-nodejs/lib/bundling";
import { Runtime } from "@aws-cdk/aws-lambda";
import { experimental } from "@aws-cdk/aws-cloudfront";
import { EdgeFunction } from "@aws-cdk/aws-cloudfront/lib/experimental";

export interface RemapOptions {
  path: string;
}

export class ArbitraryPathRemapFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string, options: RemapOptions) {
    super(scope, id);

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-edge-function`,
      {
        code: Bundling.bundle({
          entry: `${__dirname}/handlers/remap.ts`,
          runtime: Runtime.NODEJS_18_X,
          sourceMap: true,
          projectRoot: `${__dirname}/handlers/`,
          depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
          // Define options replace values at build time so we can use environment variables to test locally
          // and replace during build/deploy with static values. This gets around the lambda@edge limitation
          // of no environment variables at runtime.
          define: {
            "process.env.REMAP_PATH": JSON.stringify(options.path),
          },
        } as any),
        runtime: Runtime.NODEJS_14_X,
        handler: "index.handler",
      }
    );
  }
}
