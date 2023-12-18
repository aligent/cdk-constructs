import { Construct } from "constructs";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { LambdaToSqsToLambda } from "@aws-solutions-constructs/aws-lambda-sqs-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Duration } from "aws-cdk-lib";

/**
 * Options for the Prerender Recache API.
 */
export interface PrerenderRecacheApiOptions {
  /**
   * The S3 bucket where prerendered pages are stored.
   */
  prerenderS3Bucket: Bucket;
  /**
   * Maximum number of concurrent executions of the Prerender Recache API.
   */
  maxConcurrentExecutions: number;
  /**
   * Secrets Manager secret name having Map<string, string[]> as its value, e.g.,
   * { "tokenABC": "https://URL_A,https://URL_B,...", ..., "tokenXYZ":"https://URL_Y,https://URL_Z" }
   */
  tokenSecret: string;
}

/**
 * Represents an API for recaching prerendered pages.
 */
export class PrerenderRecacheApi extends Construct {
  readonly api: LambdaRestApi;

  constructor(
    scope: Construct,
    id: string,
    options: PrerenderRecacheApiOptions
  ) {
    super(scope, id);

    const apiHandler = createApiLambdaFunction(this, options);

    this.api = new LambdaRestApi(this, "prerenderRecacheApi", {
      handler: apiHandler,
      proxy: false,
    });

    const recache = this.api.root.addResource("recache");
    recache.addMethod("POST");

    new LambdaToSqsToLambda(this, "prerenderRequestQueue", {
      existingProducerLambdaObj: apiHandler,
      existingConsumerLambdaObj: new NodejsFunction(this, "consumer", {
        reservedConcurrentExecutions: options.maxConcurrentExecutions,
        timeout: Duration.seconds(60),
      }),
      deployDeadLetterQueue: false,
      queueProps: { visibilityTimeout: Duration.minutes(60) },
    });
  }
}

/**
 * Creates a NodejsFunction that handles the Prerender Recache API.
 * @param scope - The Construct scope.
 * @param options - The options for the Prerender Recache API.
 * @returns The NodejsFunction that handles the Prerender Recache API.
 */
const createApiLambdaFunction = (
  scope: Construct,
  options: PrerenderRecacheApiOptions
): NodejsFunction => {
  const apiHandler = new NodejsFunction(scope, "api", {
    timeout: Duration.seconds(60),
  });

  apiHandler.addEnvironment(
    "PRERENDER_CACHE_BUCKET",
    options.prerenderS3Bucket.bucketName
  );

  apiHandler.addEnvironment("TOKEN_SECRET", options.tokenSecret);

  // const ssmGetParameterPolicy = new iam.PolicyStatement({
  //   actions: ["ssm:GetParameter"],
  //   resources: ["*"],
  // }); // should be arn:aws:ssm:::parameter/prerender/recache/tokens/*, but can't make that work

  // const ssmDescribeParameterPolicy = new iam.PolicyStatement({
  //   actions: ["ssm:DescribeParameters"],
  //   resources: ["*"],
  // });

  const smGetSecretPolicy = new iam.PolicyStatement({
    actions: ["ssm:GetSecretValue"],
    resources: ["*"], // TODO: use `arn:aws:secretsmanager:Region:AccountId:secret:${options.tokenSecret}`
  });

  const smDescribeSecretPolicy = new iam.PolicyStatement({
    actions: ["ssm:DescribeSecret"],
    resources: ["*"], // TODO: use `arn:aws:secretsmanager:Region:AccountId:secret:${options.tokenSecret}`
  });

  const s3DeleteObjectPolicy = new iam.PolicyStatement({
    actions: ["s3:DeleteObject"],
    resources: [`${options.prerenderS3Bucket.bucketArn}/*`],
  });

  apiHandler.addToRolePolicy(smGetSecretPolicy);
  apiHandler.addToRolePolicy(smDescribeSecretPolicy);
  apiHandler.addToRolePolicy(s3DeleteObjectPolicy);

  return apiHandler;
};
