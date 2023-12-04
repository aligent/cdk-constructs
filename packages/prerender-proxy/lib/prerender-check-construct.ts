import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export class PrerenderCheckFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new EdgeFunction(this, `${id}-prerender-check-fn`, {
      code: Code.fromAsset(join(__dirname, "handlers"), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "handlers/prerender-check.ts")],
          }),
        },
      }),
      runtime: Runtime.NODEJS_18_X,
      handler: "prerender-check.handler",
    });
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "prerender-check-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
