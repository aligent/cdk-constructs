import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface SecurityHeaderFunctionProps {
  contentSecurityPolicy?: Array<string>;
}

export class SecurityHeaderFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(
    scope: Construct,
    id: string,
    props?: SecurityHeaderFunctionProps
  ) {
    super(scope, id);

    const defineOptions: {
      __CONTENT_SECURITY_POLICY__?: string;
    } = {};

    if (props?.contentSecurityPolicy) {
      defineOptions.__CONTENT_SECURITY_POLICY__ = JSON.stringify(
        props.contentSecurityPolicy.join("; ")
      );
    }

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new EdgeFunction(this, `${id}-security-header-fn`, {
      code: Code.fromAsset(join(__dirname, "handlers"), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "handlers/security-header.ts")],
            define: defineOptions,
          }),
        },
      }),
      runtime: Runtime.NODEJS_18_X,
      handler: "security-header.handler",
    });
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "security-header-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
