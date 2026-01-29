import { Construct } from "constructs";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Esbuild } from "@aligent/cdk-esbuild";
import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { join } from "path";

export interface BasicAuthFunctionOptions {
  username: string;
  password: string;
  debugMode?: any;
}

export class BasicAuthFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(scope: Construct, id: string, options: BasicAuthFunctionOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-basic-auth-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/basic-auth.ts")],
              define: {
                "process.env.AUTH_USERNAME": options.username,
                "process.env.AUTH_PASSWORD": options.password,
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_22_X,
        handler: "basic-auth.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "basic-auth-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
