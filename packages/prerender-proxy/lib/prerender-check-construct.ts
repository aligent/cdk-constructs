import { Construct } from "@aws-cdk/core";
import { Bundling } from '@aws-cdk/aws-lambda-nodejs/lib/bundling';
import { Runtime } from '@aws-cdk/aws-lambda';
import { experimental } from '@aws-cdk/aws-cloudfront';
import { EdgeFunction } from "@aws-cdk/aws-cloudfront/lib/experimental";

export class PrerenderCheckFunction extends Construct {
    readonly edgeFunction: EdgeFunction;

    constructor(scope: Construct, id: string) {
      super(scope, id);
      this.edgeFunction = new experimental.EdgeFunction(
        this,
        'PrerenderCheckFunction',
        {
          code: Bundling.bundle({
            entry: `${__dirname}/handlers/prerender-check.ts`,
            runtime: Runtime.NODEJS_12_X,
            sourceMap: true,
            projectRoot: `${__dirname}/handlers/`,
            depsLockFilePath: `${__dirname}/handlers/package-lock.json`
          }),
          runtime: Runtime.NODEJS_12_X,
          handler: 'index.handler',
        }
      );
    }
}
