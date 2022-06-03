import { Construct } from 'constructs';
import { CfnOutput } from 'aws-cdk-lib';
import { Bundling } from 'aws-cdk-lib/aws-lambda-nodejs/lib/bundling';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { experimental } from 'aws-cdk-lib/aws-cloudfront';
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";

export interface SecurityHeaderFunctionProps {
  contentSecurityPolicy?: Array<String>
}

export class SecurityHeaderFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string, props?: SecurityHeaderFunctionProps) {
    super(scope, id);

    let defineOptions: any = {};

    if (props?.contentSecurityPolicy) {
      defineOptions.__CONTENT_SECURITY_POLICY__ = JSON.stringify(props.contentSecurityPolicy.join('; '));
    }

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      'SecurityHeaderFunction',
      {
        code: Bundling.bundle({
          entry: `${__dirname}/handlers/security-header.ts`,
          runtime: Runtime.NODEJS_14_X,
          sourceMap: true,
          projectRoot: `${__dirname}/handlers/`,
          depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
          define: defineOptions
        } as any), // TODO fix typing
        runtime: Runtime.NODEJS_14_X,
        handler: 'index.handler',
      }
    );

    new CfnOutput(this, 'SecurityHeaderVersionARN', {
      description: 'SecurityHeaderVersionARN',
      value: this.edgeFunction.currentVersion.edgeArn,
    });
  }
}
