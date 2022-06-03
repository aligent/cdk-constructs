import { Construct } from 'constructs';
import { Bundling } from 'aws-cdk-lib/aws-lambda-nodejs/lib/bundling';
import { Runtime, Architecture } from 'aws-cdk-lib/aws-lambda';
import { experimental } from 'aws-cdk-lib/aws-cloudfront';
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";

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
            depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
            architecture: Architecture.X86_64
          }),
          runtime: Runtime.NODEJS_12_X,
          handler: 'index.handler',
        }
      );
    }
}
