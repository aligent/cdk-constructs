import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface RemapOptions {
  path: string;
}

export class PathRemapFunction extends Construct {
  readonly edgeFunction: cf.experimental.EdgeFunction;

  constructor(scope: Construct, id: string, options: RemapOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new cf.experimental.EdgeFunction(
      this,
      `${id}-remap-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/remap.ts")],
              define: {
                "process.env.REMAP_PATH": '"' + options.path + '"',
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "remap.handler",
      },
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "remap-fn-version",
      this.edgeFunction.currentVersion.edgeArn,
    );
  }
}
