import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import { Code, IVersion, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface PrerenderCheckOptions {
  /**
   * A custom regex string to detect bots. Will be used in addition
   * to the existing bot check regex to determine if a user-agent is a bot.
   *
   * @type string
   */
  customBotCheckRegex: string;
}

export class PrerenderCheckFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(scope: Construct, id: string, options?: PrerenderCheckOptions) {
    super(scope, id);

    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    this.edgeFunction = new experimental.EdgeFunction(
      this,
      `${id}-prerender-check-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [join(__dirname, "handlers/prerender-check.ts")],
              define: {
                "process.env.CUSTOM_BOT_CHECK": JSON.stringify(
                  options?.customBotCheckRegex ?? "[]"
                ),
              },
            }),
          },
        }),
        runtime: Runtime.NODEJS_18_X,
        handler: "prerender-check.handler",
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "prerender-check-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}
