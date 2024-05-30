import { Construct } from "@aws-cdk/core";
import { Bundling } from "@aws-cdk/aws-lambda-nodejs/lib/bundling";
import { Runtime } from "@aws-cdk/aws-lambda";
import { experimental } from "@aws-cdk/aws-cloudfront";
import { EdgeFunction } from "@aws-cdk/aws-cloudfront/lib/experimental";

export interface PrerenderCheckOptions {
  /**
   * A custom regex string to detect bots. Will be used in addition 
   * to the existing bot check regex to determine if a user-agent is a bot.
   * 
   * @type string
   */
  customBotCheckRegex: string
}

export class PrerenderCheckFunction extends Construct {
  readonly edgeFunction: EdgeFunction;

  constructor(scope: Construct, id: string, options?: PrerenderCheckOptions) {
    super(scope, id);
    this.edgeFunction = new experimental.EdgeFunction(
      this,
      "PrerenderCheckFunction",
      {
        code: Bundling.bundle({
          entry: `${__dirname}/handlers/prerender-check.ts`,
          runtime: Runtime.NODEJS_16_X,
          sourceMap: true,
          projectRoot: `${__dirname}/handlers/`,
          depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
          define: {
            "process.env.CUSTOM_BOT_CHECK": JSON.stringify(
              options?.customBotCheckRegex ?? "[]"
            ),
          },
        } as any),
        runtime: Runtime.NODEJS_16_X,
        handler: "index.handler",
      }
    );
  }
}
