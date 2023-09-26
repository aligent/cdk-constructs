import {
  AssetHashType,
  BundlingOptions,
  DockerImage,
  ILocalBundling,
} from "aws-cdk-lib";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { buildSync, BuildOptions } from "esbuild";
import * as cf from "aws-cdk-lib/aws-cloudfront";

export interface RemapOptions {
  path: string;
}

class Esbuild implements ILocalBundling {
  private readonly options: BuildOptions;

  constructor(options: BuildOptions) {
    this.options = options;
  }

  tryBundle(outputDir: string, options: BundlingOptions): boolean {
    try {
      this.options.outdir = outputDir;
      buildSync(this.options);
    } catch (error) {
      console.log(error);
      return true;
    }

    return true;
  }
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
      `${id}-edge-function`,
      {
        code: Code.fromAsset(join(__dirname, "edge-handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/remap.ts")],
              logLevel: "info",
              sourcemap: false,
              bundle: true,
              minify: true,
              platform: "node",
              define: {
                "process.env.REMAP_PATH": JSON.stringify(options.path),
              },
              // If identifiers are minified `handler` will be, and will break the function
              minifyIdentifiers: false,
              minifyWhitespace: true,
              minifySyntax: true,
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "index.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "remap-function-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
