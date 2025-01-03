import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface GeoIpRegion {
  // The domain that services a region (www.example.com for US/CA www.example.com.au for AU/NZ)
  regionDomain: string;
  // Case-sensitive regular expression matching cloudfront-viewer-country
  supportedSubRegions: Record<string, string | undefined>;
} // add an aboslute redirect URL such as yd.co.nz for eg

export interface RedirectFunctionOptions {
  supportedRegions: GeoIpRegion[]
  // default region code to use when not matched
  defaultRegionCode: string;
  defaultDomain: string;
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
              entryPoints: [join(__dirname, "handlers/redirect.ts")],
              define: {
                "process.env.DEFAULT_DOMAIN": JSON.stringify(options.defaultDomain),
                "process.env.DEFAULT_REGION_CODE": JSON.stringify(options.defaultRegionCode),
                "process.env.SUPPORTED_REGIONS": // find out if this is passing as string or not, cloudW says not
                  JSON.stringify(options.supportedRegions)
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
    return Version.fromVersionArn( // SEE THE README ON YOUR DESKTOP (AND DELETE THESE COMMENTS)
      this,
      "redirect-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
