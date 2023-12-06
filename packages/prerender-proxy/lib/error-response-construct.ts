import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface ErrorResponseFunctionOptions {
  pathPrefix?: string;
  frontendHost: string;
}

export class ErrorResponseFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(
    scope: Construct,
    id: string,
    options: ErrorResponseFunctionOptions
  ) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-error-response-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/error-response.ts")],
              define: {
                "process.env.PATH_PREFIX": JSON.stringify(
                  options.pathPrefix ?? ""
                ),
                "process.env.FRONTEND_HOST": JSON.stringify(
                  options.frontendHost
                ),
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "error-response.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "error-response-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
