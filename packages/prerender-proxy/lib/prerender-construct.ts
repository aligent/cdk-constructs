import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/esbuild";

export interface PrerenderFunctionOptions {
  prerenderToken: string;
  prerenderUrl?: string;
  pathPrefix?: string;
}

export class PrerenderFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string, options: PrerenderFunctionOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new EdgeFunction(this, `${id}-prerender-fn`, {
      code: Code.fromAsset(join(__dirname, "handlers"), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "handlers/prerender.ts")],
            define: {
              "process.env.PRERENDER_TOKEN": options.prerenderToken,
              "process.env.PATH_PREFIX": options.pathPrefix ?? "",
              "process.env.PRERENDER_URL":
                options.prerenderUrl ?? "service.prerender.io",
            },
          }),
        },
      }),
      runtime: Runtime.NODEJS_18_X,
      handler: "prerender.handler",
    });
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "prerender-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
