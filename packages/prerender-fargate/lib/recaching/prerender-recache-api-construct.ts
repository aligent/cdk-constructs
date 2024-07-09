import { Construct } from "constructs";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { LambdaToSqsToLambda } from "@aws-solutions-constructs/aws-lambda-sqs-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Stack, Duration } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";

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

  /**
   * A name for the recache queue
   *
   * @default CloudFormation-generated name
   */
  queueName?: string;

  /**
   * A name for the API Gateway RestApi resource.
   *
   * @default - ID of the RestApi construct.
   */
  restApiName?: string;
}

/**
 * Represents an API for recaching prerendered pages.
 */

export class PrerenderRecacheApi extends Construct {
  readonly api: LambdaRestApi;
  readonly queue: Queue;
  readonly consumer: lambda.Function;
  readonly producer: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    options: PrerenderRecacheApiOptions
  ) {
    super(scope, id);

    const apiHandler = createApiLambdaFunction(this, options);

    const smGetSecretPolicy = new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${Stack.of(this).region}:${
          Stack.of(this).account
        }:secret:${options.tokenSecret}-*`,
      ],
    });

    const smDescribeSecretPolicy = new iam.PolicyStatement({
      actions: ["secretsmanager:DescribeSecret"],
      resources: [
        `arn:aws:secretsmanager:${Stack.of(this).region}:${
          Stack.of(this).account
        }:secret:${options.tokenSecret}-*`,
      ],
    });

    const s3DeleteObjectPolicy = new iam.PolicyStatement({
      actions: ["s3:DeleteObject"],
      resources: [`${options.prerenderS3Bucket.bucketArn}/*`],
    });

    apiHandler.addToRolePolicy(smGetSecretPolicy);
    apiHandler.addToRolePolicy(smDescribeSecretPolicy);
    apiHandler.addToRolePolicy(s3DeleteObjectPolicy);

    this.api = new LambdaRestApi(this, "prerenderRecacheApi", {
      handler: apiHandler,
      proxy: false,
      restApiName:
        options.restApiName !== undefined ? options.restApiName : undefined,
    });

    const recache = this.api.root.addResource("recache");
    recache.addMethod("POST");

    const sqsLambda = new LambdaToSqsToLambda(this, "prerenderRequestQueue", {
      existingProducerLambdaObj: apiHandler,
      existingConsumerLambdaObj: new NodejsFunction(this, "consumer", {
        reservedConcurrentExecutions: options.maxConcurrentExecutions,
        timeout: Duration.seconds(120),
      }),
      deployDeadLetterQueue: false,
      queueProps: {
        visibilityTimeout: Duration.minutes(60),
        queueName:
          options.queueName !== undefined ? options.queueName : undefined,
      },
    });

    this.queue = sqsLambda.sqsQueue;
    this.consumer = sqsLambda.consumerLambdaFunction;
    this.producer = sqsLambda.producerLambdaFunction;
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

  return apiHandler;
};
