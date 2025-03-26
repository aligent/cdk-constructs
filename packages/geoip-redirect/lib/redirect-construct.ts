import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

/**
 * The default region, domain, and other supported regions for a website to redirect to.
 */
export interface RedirectFunctionOptions {
  /**
   * Regex formatted string to match region codes and redirect to the DomainOverwrite destination.
   * @default undefined
   */
  supportedRegions?: Record<string, string>;
  /**
   * Regex for supported domain paths on the default domain eg .com/au
   */
  defaultRegionCodes: string[];
  /**
   * Default domain to redirect to unless otherwise specified.
   */
  defaultDomain: string;
  /**
   * Toggle whether to use a path suffix for a region such as `.com/au` or just `.com`  .
   * @default false
   */
  enablePathRedirect?: boolean;
}

export class RedirectFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(scope: Construct, id: string, options: RedirectFunctionOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-redirect-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              minify: false,
              minifySyntax: false,
              minifyWhitespace: false,
              entryPoints: [join(__dirname, "handlers/redirect.ts")],
              define: {
                "process.env.DEFAULT_DOMAIN": JSON.stringify(
                  options.defaultDomain
                ),
                "process.env.DEFAULT_REGION_CODE": JSON.stringify(
                  options.defaultRegionCodes.join(",")
                ).toLowerCase(),
                "process.env.SUPPORTED_REGIONS": JSON.stringify(
                  options.supportedRegions
                )?.toLowerCase(),
                "process.env.ENABLE_PATH_REDIRECT": JSON.stringify(
                  options.enablePathRedirect ?? false
                )?.toLowerCase(),
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "redirect.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "redirect-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
