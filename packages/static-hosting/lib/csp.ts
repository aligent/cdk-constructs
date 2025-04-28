import { AssetHashType, DockerImage, Duration } from "aws-cdk-lib";
import { experimental } from "aws-cdk-lib/aws-cloudfront";
import {
  Code,
  FunctionOptions,
  IVersion,
  Runtime,
  Version,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface EdgeLambdaFunctionOptions {
  handlerName: string;
  define?: { [key: string]: string };
  functionOptions?: Partial<FunctionOptions>;
}

class EdgeLambdaFunction extends Construct {
  readonly edgeFunction: experimental.EdgeFunction;

  constructor(
    scope: Construct,
    id: string,
    options: EdgeLambdaFunctionOptions
  ) {
    super(scope, id);

    this.edgeFunction = this.createEdgeFunction(id, options);
  }

  private createEdgeFunction(
    id: string,
    options: EdgeLambdaFunctionOptions
  ): experimental.EdgeFunction {
    const command = [
      "sh",
      "-c",
      'echo "Docker build not supported. Please install esbuild."',
    ];

    return new experimental.EdgeFunction(
      this,
      `${id}-${options.handlerName}-fn`,
      {
        code: Code.fromAsset(join(__dirname, "handlers"), {
          assetHashType: AssetHashType.OUTPUT,
          bundling: {
            command,
            image: DockerImage.fromRegistry("busybox"),
            local: new Esbuild({
              entryPoints: [
                join(
                  __dirname,
                  `handlers/csp-lambda/${options.handlerName}.ts`
                ),
              ],
              define: options.define,
              minify: false,
            }),
          },
        }),
        runtime: Runtime.NODEJS_20_X,
        handler: `${options.handlerName}.handler`,
        ...options.functionOptions,
      }
    );
  }

  public getFunctionVersion(): IVersion {
    return Version.fromVersionArn(
      this,
      "checkout-fn-version",
      this.edgeFunction.currentVersion.edgeArn
    );
  }
}

export interface RequestFunctionOptions {
  rootObject?: string;
  pathPrefix?: string;
  functionOptions?: Partial<FunctionOptions>;
}

export class RequestFunction extends EdgeLambdaFunction {
  constructor(scope: Construct, id: string, options: RequestFunctionOptions) {
    super(scope, id, {
      ...options,
      handlerName: "origin-request",
      define: {
        "process.env.PATH_PREFIX": JSON.stringify(options.pathPrefix ?? ""),
        "process.env.ROOT_OBJECT": JSON.stringify(
          options.rootObject ?? "index.html"
        ),
      },
    });
  }
}

export interface ResponseFunctionOptions {
  bucket: string;
  cspObject?: string;
  reportUri?: string;
  fallbackCsp?: string;
  bucketRegion?: string;
  functionOptions?: Partial<FunctionOptions>;
}

export class ResponseFunction extends EdgeLambdaFunction {
  constructor(scope: Construct, id: string, options: ResponseFunctionOptions) {
    super(scope, id, {
      ...options,
      handlerName: "origin-response",
      define: {
        "process.env.S3_BUCKET": JSON.stringify(options.bucket),
        "process.env.CSP_OBJECT": JSON.stringify(
          options.cspObject ?? "csp.txt"
        ),
        "process.env.REPORT_URI": JSON.stringify(options.reportUri ?? ""),
        "process.env.FALLBACK_CSP": JSON.stringify(options.fallbackCsp ?? ""),
        "process.env.BUCKET_REGION": JSON.stringify(
          options.bucketRegion ?? "us-east-1"
        ),
      },
      functionOptions: {
        timeout: Duration.seconds(3),
        memorySize: 512,
        ...options.functionOptions,
      },
    });
  }
}
