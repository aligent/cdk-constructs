import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as path from "path";
import { PrerenderRecacheApi } from "./recaching/prerender-recache-api-construct";
import { PrerenderFargateOptions } from "./prerender-fargate-options";
import { PerformanceMetrics } from "./monitoring";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import {
  SslPolicy,
  ListenerCondition,
  ListenerAction,
  CfnListener,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";

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
 *     vpc: vpc,
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
      tokenSecret,
      certificateArn,
      maxInstanceCount,
      instanceMemory,
      instanceCPU,
      expirationDays,
      enableS3Endpoint,
      enableRedirectCache,
      enableNotFoundCache,
      desiredInstanceCount,
      bucketName,
      domainName,
      prerenderName,
      minInstanceCount,
      prerenderFargateScalingOptions,
      prerenderFargateRecachingOptions,
      enableRecache,
      enablePrerenderHeader,
      usePrivateSubnets,
      queueName,
      restApiName,
      chromeBrowserFlags,
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

    // If a VPC is not provided then deploy to the default VPC
    let vpc: ec2.IVpc;
    if (props.vpc) {
      vpc = props.vpc;
    } else if (props.vpcId) {
      vpc = ec2.Vpc.fromLookup(this, "vpc", { vpcId: props.vpcId });
    } else {
      vpc = ec2.Vpc.fromLookup(this, "vpc", { isDefault: true });
    }

    const cluster = new ecs.Cluster(this, `${prerenderName}-cluster`, {
      vpc: vpc,
      clusterName:
        props.clusterName !== undefined ? props.clusterName : undefined,
      containerInsights: true,
    });

    const directory = path.join(__dirname, "prerender");
    const asset = new ecrAssets.DockerImageAsset(
      this,
      `${prerenderName}-image`,
      {
        directory,
        platform: ecrAssets.Platform.LINUX_AMD64,
      }
    );

    // Build ECS service taskImageOption
    const environment = {
      S3_BUCKET_NAME: this.bucket.bucketName,
      AWS_REGION: Stack.of(this).region,
      ENABLE_REDIRECT_CACHE: enableRedirectCache?.toString() || "false",
      ENABLE_NOTFOUND_CACHE: enableNotFoundCache?.toString() || "false",
      ENABLE_PRERENDER_HEADER: enablePrerenderHeader?.toString() || "true",
      CHROME_BROWSER_FLAGS: chromeBrowserFlags?.join(",") || "",
    };

    const secrets = {
      TOKEN_SECRET: ecs.Secret.fromSecretsManager(
        sm.Secret.fromSecretNameV2(this, "secrets", tokenSecret)
      ),
    };

    // Configure a custom log driver and group
    const logGroup = new LogGroup(this, "prerender-server-log", {});
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: props.logStreamPrefix || "prerender-server",
      logGroup: logGroup,
    });

    // Create a load-balanced Fargate service
    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        `${prerenderName}-service`,
        {
          cluster,
          serviceName: `${prerenderName}-service`,
          desiredCount: desiredInstanceCount || 1,
          cpu: instanceCPU || 2048, // 2 vCPU default
          memoryLimitMiB: instanceMemory || 4096, // 4 GB default to give Chrome enough memory
          taskImageOptions: {
            containerName: `${prerenderName}-container`,
            image: ecs.ContainerImage.fromDockerImageAsset(asset),
            enableLogging: true,
            containerPort: 3000,
            environment,
            secrets,
            family:
              props.taskDefinitionFamilyName !== undefined
                ? props.taskDefinitionFamilyName
                : undefined,
            logDriver: logDriver,
          },
          publicLoadBalancer: true,
          loadBalancerName:
            props.loadBalancerName !== undefined
              ? props.loadBalancerName
              : undefined,
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
          taskSubnets: {
            subnetType: usePrivateSubnets
              ? ec2.SubnetType.PRIVATE_WITH_EGRESS
              : ec2.SubnetType.PUBLIC,
          },
          sslPolicy: SslPolicy.TLS13_RES,
        }
      );

    // Grant S3 Bucket access to the task role
    this.bucket.grantReadWrite(fargateService.taskDefinition.taskRole);

    // Override the default action to return 403 for unauthorized requests
    const listenerCfn = fargateService.listener.node
      .defaultChild as CfnListener;
    listenerCfn.defaultActions = [
      {
        type: "fixed-response",
        fixedResponseConfig: {
          statusCode: "403",
          contentType: "application/json",
          messageBody: JSON.stringify({
            error: "Forbidden",
            message: "Missing required header",
          }),
        },
      },
    ];

    // Allow health checks on /health path without token
    fargateService.listener.addAction("allow-health-check", {
      priority: 50,
      conditions: [ListenerCondition.pathPatterns(["/health"])],
      action: ListenerAction.forward([fargateService.targetGroup]),
    });

    // Allow requests WITH the x-prerender-token header (forward to target group)
    fargateService.listener.addAction("allow-with-token", {
      priority: 100,
      conditions: [
        ListenerCondition.httpHeader("x-prerender-token", ["*"]), // Any value present
      ],
      action: ListenerAction.forward([fargateService.targetGroup]),
    });

    // As the prerender service will return a 401 on all unauthorised requests
    // It should be considered healthy when receiving a 401 response
    fargateService.targetGroup.configureHealthCheck({
      path: "/health",
      interval: Duration.seconds(
        prerenderFargateScalingOptions?.healthCheckInterval || 120
      ),
      unhealthyThresholdCount:
        prerenderFargateScalingOptions?.unhealthyThresholdCount || 5,
      healthyHttpCodes: "200",
    });

    // Setup AutoScaling policy
    const scaling = fargateService.service.autoScaleTaskCount({
      maxCapacity: maxInstanceCount || 4,
      minCapacity: minInstanceCount || 1,
    });
    scaling.scaleOnCpuUtilization(`${prerenderName}-scaling`, {
      targetUtilizationPercent:
        prerenderFargateScalingOptions?.targetUtilizationPercent || 10,
      scaleInCooldown: Duration.seconds(
        prerenderFargateScalingOptions?.scaleInCooldown || 60
      ),
      scaleOutCooldown: Duration.seconds(
        prerenderFargateScalingOptions?.scaleOutCooldown || 60
      ),
    });

    /**
     * Enable VPC Endpoints for S3
     * This would create S3 endpoints in all the PUBLIC subnets of the VPC
     */
    if (enableS3Endpoint) {
      vpc.addGatewayEndpoint("S3Endpoint", {
        service: ec2.GatewayVpcEndpointAwsService.S3,
        subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
      });
    }

    let recacheApi;
    /**
     * Recache API is enable by default
     * This would create the API that is used to trigger recaching of the URLs
     */
    if (enableRecache === undefined || enableRecache) {
      recacheApi = new PrerenderRecacheApi(
        this,
        `${prerenderName}-recache-api`,
        {
          prerenderS3Bucket: this.bucket,
          maxConcurrentExecutions:
            prerenderFargateRecachingOptions?.maxConcurrentExecutions || 1,
          tokenSecret,
          queueName,
          restApiName,
        }
      );
    }

    new PerformanceMetrics(this, "cloudwatch", {
      ...props,
      service: fargateService.service,
      loadBalancer: fargateService.loadBalancer,
      logGroup: logGroup,
      cacheBucket: this.bucket,
      recache: recacheApi,
    });
  }
}
