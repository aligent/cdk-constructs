import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface CloudFrontCacheControlOptions {
  cacheKey?: string;
  maxAge?: number;
}

export class CloudFrontCacheControl extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(
    scope: Construct,
    id: string,
    options?: CloudFrontCacheControlOptions
  ) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-cache-control-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/cache-control.ts")],
              define: {
                "process.env.PRERENDER_CACHE_KEY":
                  options?.cacheKey ?? "x-prerender-requestid",
                "process.env.PRERENDER_CACHE_MAX_AGE":
                  String(options?.maxAge) ?? "0",
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "cache-control.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "cache-control-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
