import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface PrerenderFunctionOptions {
  prerenderToken: string;
  prerenderUrl?: string;
  pathPrefix?: string;
}

export class PrerenderFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(scope: Construct, id: string, options: PrerenderFunctionOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-prerender-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/prerender.ts")],
              define: {
                "process.env.PRERENDER_TOKEN": JSON.stringify(
                  options.prerenderToken
                ),
                "process.env.PATH_PREFIX": JSON.stringify(
                  options.pathPrefix ?? ""
                ),
                "process.env.PRERENDER_URL": JSON.stringify(
                  options.prerenderUrl ?? "service.prerender.io"
                ),
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_22_X,
        handler: "prerender.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "prerender-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
