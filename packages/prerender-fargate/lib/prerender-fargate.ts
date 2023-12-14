import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as path from "path";
import { PrerenderTokenUrlAssociation } from "./recaching/prerender-tokens";
import { PrerenderRecacheApi } from "./recaching/prerender-recache-api-construct";
import { PrerenderFargateOptions } from "./prerender-fargate-options";

/**
 * `PrerenderFargate` construct sets up an AWS Fargate service to run a
 * Prerender service in an ECS cluster.
 *
 * Prerender is a node server that uses Headless Chrome to render HTML,
 * screenshots, PDFs, and HAR files out of any web page. The Prerender server
 * listens for an http request, takes the URL and loads it in Headless Chrome,
 * waits for the page to finish loading by waiting for the network to be idle,
 * and then returns your content to the requesting client.
 *
 * ### AWS Resources Created/Configured by this Class:
 * - **S3 Bucket**: For storing prerendered web pages.
 * - **Fargate Service**: For running the Prerender service..
 * - **ECR Asset**: For managing the Docker image of Prerender service.
 * - **VPC & VPC Endpoints**: For network configuration and enabling direct access to S3.
 * - **Recache API**: (optional) To trigger recaching of URLs.
 *
 * ### Usage
 * The class is utilized by instantiating it with suitable `PrerenderFargateOptions`
 * and placing it within a CDK stack. The `PrerenderOptions` parameter allows the
 * developer to customize various aspects of the Prerender service.
 *
 * ### Example
 * ```typescript
 * new PrerenderFargate(this, 'PrerenderService', {
 *     prerenderName: 'myPrerender',
 *     bucketName: 'myPrerenderBucket',
 *     expirationDays: 7,
 *     vpcId: 'vpc-xxxxxxxx',
 *     desiredInstanceCount: 1,
 *     instanceCPU: 512,
 *     instanceMemory: 1024,
 *     domainName: 'prerender.mydomain.com',
 *     certificateArn: 'arn:aws:acm:region:account:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
 *     enableRedirectCache: 'false',
 *     maxInstanceCount: 2,
 *     enableS3Endpoint: true,
 *     tokenParam: '/prerender/tokens'
 * });
 * ```
 *
 * @param {Construct} scope The scope of the construct.
 * @param {string} id The ID of the construct.
 * @param {PrerenderFargateOptions} props The properties of the Prerender Fargate service.
 *
 * @returns {PrerenderFargate} An instance of the PrerenderFargate class.
 */

export class PrerenderFargate extends Construct {
  readonly bucket: Bucket;

  /**
   * Constructs a new Prerender Fargate service.
   * @param scope The scope of the construct.
   * @param id The ID of the construct.
   * @param props The properties of the Prerender Fargate service.
   */
  constructor(scope: Construct, id: string, props: PrerenderFargateOptions) {
    super(scope, id);

    const {
      tokenParam,
      tokenUrlAssociation,
      certificateArn,
      vpcId,
      maxInstanceCount,
      instanceMemory,
      instanceCPU,
      expirationDays,
      enableS3Endpoint,
      enableRedirectCache,
      desiredInstanceCount,
      bucketName,
      domainName,
      prerenderName,
      minInstanceCount,
      prerenderFargateScalingOptions,
      prerenderFargateRecachingOptions,
      enableRecache,
    } = props;

    // Create bucket for prerender storage
    this.bucket = new Bucket(this, `${prerenderName}-bucket`, {
      bucketName: bucketName,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(expirationDays || 7), // Default to 7 day expiration
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const vpcLookup = vpcId ? { vpcId: vpcId } : { isDefault: true };
    const vpc = ec2.Vpc.fromLookup(this, "vpc", vpcLookup);

    const cluster = new ecs.Cluster(this, `${prerenderName}-cluster`, {
      vpc: vpc,
    });

    const directory = path.join(__dirname, "prerender");
    const asset = new ecrAssets.DockerImageAsset(
      this,
      `${prerenderName}-image`,
      {
        directory,
      }
    );

    // Build ECS service taskImageOption
    let secrets = {};
    const environment = {
      S3_BUCKET_NAME: this.bucket.bucketName,
      AWS_REGION: Stack.of(this).region,
      ENABLE_REDIRECT_CACHE: enableRedirectCache || "false",
      TOKEN_LIST: "",
    };
    if (tokenParam) {
      /**
       * tokenParam is the name of the SSM Parameter that has a stringList of tokens as its value.
       * If tokenParam is present, which is the better security practice, it will override tokenList and/or tokenUrlAssociation.
       * Tokens for Recache API doesn't need to be fed via Stack, as it should have its own SSM parameter(s).
       */
      secrets = {
        /**
         * secrets and environment properties of taskImageOption can't have the same env var name defined, hence TOKEN_LIST_SSM is used here.
         * TOKEN_LIST_SSM and TOKEN_LIST are handled within the application, i.e. server.js
         */
        TOKEN_LIST_SSM: ecs.Secret.fromSsmParameter(
          ssm.StringListParameter.fromStringListParameterName(
            this,
            "token",
            tokenParam
          )
        ),
      };
    } else if (tokenUrlAssociation || props.tokenList) {
      /**
       * This provide backward compatibility for the tokenList and tokenUrlAssociation properties.
       * If tokenUrlAssociation is provided, tokenList will be ignored
       */
      let tokenList = tokenUrlAssociation
        ? Object.keys(tokenUrlAssociation.tokenUrlAssociation)
        : props.tokenList;
      if (!tokenList) tokenList = [""]; // To suppress the error in the next line about this value being potentially undefined.
      environment.TOKEN_LIST = tokenList.toString();
    } else {
      console.error(
        "Either one of tokenParam, tokenUrlAssociation, or tokenList must be provided."
      );
    }

    // Create a load-balanced Fargate service
    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        `${prerenderName}-service`,
        {
          cluster,
          serviceName: `${prerenderName}-service`,
          desiredCount: desiredInstanceCount || 1,
          cpu: instanceCPU || 512, // 0.5 vCPU default
          memoryLimitMiB: instanceMemory || 1024, // 1 GB default to give Chrome enough memory
          taskImageOptions: {
            containerName: `${prerenderName}-container`,
            image: ecs.ContainerImage.fromDockerImageAsset(asset),
            enableLogging: true,
            containerPort: 3000,
            environment,
            secrets,
          },
          publicLoadBalancer: true,
          assignPublicIp: true,
          listenerPort: 443,
          redirectHTTP: true,
          domainName: domainName,
          domainZone: new HostedZone(this, "hosted-zone", {
            zoneName: domainName,
          }),
          certificate: Certificate.fromCertificateArn(
            this,
            "cert",
            certificateArn
          ),
          // Scaling configuration
          healthCheckGracePeriod: Duration.seconds(
            prerenderFargateScalingOptions?.healthCheckGracePeriod || 20
          ),
          minHealthyPercent:
            prerenderFargateScalingOptions?.minHealthyPercent || 50,
          maxHealthyPercent:
            prerenderFargateScalingOptions?.maxHealthyPercent || 200,
        }
      );

    // Grant S3 Bucket access to the task role
    this.bucket.grantReadWrite(fargateService.taskDefinition.taskRole);

    // As the prerender service will return a 401 on all unauthorised requests
    // It should be considered healthy when receiving a 401 response
    fargateService.targetGroup.configureHealthCheck({
      path: "/health",
      interval: Duration.seconds(
        prerenderFargateScalingOptions?.healthCheckInterval || 120
      ),
      unhealthyThresholdCount:
        prerenderFargateScalingOptions?.unhealthyThresholdCount || 5,
      healthyHttpCodes: "401",
    });

    // Setup AutoScaling policy
    const scaling = fargateService.service.autoScaleTaskCount({
      maxCapacity: maxInstanceCount || 2,
      minCapacity: minInstanceCount || 1,
    });
    scaling.scaleOnCpuUtilization(`${prerenderName}-scaling`, {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(
        prerenderFargateScalingOptions?.scaleInCooldown || 60
      ),
      scaleOutCooldown: Duration.seconds(
        prerenderFargateScalingOptions?.scaleOutCooldown || 60
      ),
    });

    /**
     * Enable VPC Endpoints for S3
     * This would  create S3 endpoints in all the PUBLIC subnets of the VPC
     */
    if (enableS3Endpoint) {
      vpc.addGatewayEndpoint("S3Endpoint", {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
      });
    }

    if (tokenUrlAssociation) {
      /**
       * Create the token-url association
       * This is used for managing prerender tokens in prerender re-caching
       */
      new PrerenderTokenUrlAssociation(
        this,
        `${prerenderName}-token-url-association`,
        {
          tokenUrlAssociation: tokenUrlAssociation.tokenUrlAssociation,
          ssmPathPrefix: tokenUrlAssociation.ssmPathPrefix,
        }
      );
    }

    /**
     * Recache API is enable by default
     * This would create the API that is used to trigger recaching of the URLs
     */
    if (enableRecache === undefined || enableRecache) {
      new PrerenderRecacheApi(this, `${prerenderName}-recache-api`, {
        prerenderS3Bucket: this.bucket,
        maxConcurrentExecutions:
          prerenderFargateRecachingOptions?.maxConcurrentExecutions || 1,
      });
    }
  }
}
