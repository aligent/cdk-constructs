import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { EdgeFunction } from "aws-cdk-lib/aws-cloudfront/lib/experimental";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface RedirectFunctionOptions {
  redirectHost: string;
  // Case-sensitive regular expression matching cloudfront-viewer-country
  supportedRegionsExpression: string;
  // default region code to use when not matched
  defaultRegion: string;
}

export class RedirectFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string, options: RedirectFunctionOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new EdgeFunction(this, `${id}-redirect-fn`, {
      code: Code.fromAsset(join(__dirname, "handlers"), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "handlers/redirect.ts")],
            define: {
              "process.env.REDIRECT_HOST": options.redirectHost,
              "process.env.SUPPORTED_REGIONS":
                options.supportedRegionsExpression,
              "process.env.DEFAULT_REGION": options.defaultRegion,
            },
          }),
        },
      }),
      runtime: Runtime.NODEJS_18_X,
      handler: "redirect.handler",
    });
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "redirect-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
