import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import { AccessKey, User } from "aws-cdk-lib/aws-iam";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as path from "path";

/**
 * Options for configuring the Prerender Fargate construct.
 */
export interface PrerenderOptions {
  /**
   * The name of the Prerender service.
   */
  prerenderName: string;
  /**
   * The domain name to prerender.
   */
  domainName: string;
  /**
   * The ID of the VPC to deploy the Fargate service in.
   */
  vpcId?: string;
  /**
   * The name of the S3 bucket to store prerendered pages in.
   */
  bucketName?: string;
  /**
   * The number of days to keep prerendered pages in the S3 bucket before expiring them.
   */
  expirationDays?: number;
  /**
   * A list of tokens to use for authentication with the Prerender service.
   */
  tokenList: Array<string>;
  /**
   * The ARN of the SSL certificate to use for HTTPS connections.
   */
  certificateArn: string;
  /**
   * The desired number of Fargate instances to run.
   */
  desiredInstanceCount?: number;
  /**
   * The maximum number of Fargate instances to run.
   */
  maxInstanceCount?: number;
  /**
   * The amount of CPU to allocate to each Fargate instance.
   */
  instanceCPU?: number;
  /**
   * The amount of memory to allocate to each Fargate instance.
   */
  instanceMemory?: number;
  /**
   * Whether to enable caching of HTTP redirects.
   */
  enableRedirectCache?: string;
  /**
   * Whether to enable the S3 endpoint for the VPC.
   */
  enableS3Endpoint?: boolean;
}

export class PrerenderFargate extends Construct {
  readonly bucket: Bucket;

    /**
     * Constructs a new Prerender Fargate service.
     * @param scope The scope of the construct.
     * @param id The ID of the construct.
     * @param props The properties of the Prerender Fargate service.
     */
    constructor(scope: Construct, id: string, props: PrerenderOptions) {
        super(scope, id);

    // Create bucket for prerender storage
    this.bucket = new Bucket(this, `${props.prerenderName}-bucket`, {
      bucketName: props.bucketName,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(props.expirationDays || 7), // Default to 7 day expiration
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // Configure access to the bucket for the container
    const user = new User(this, "PrerenderAccess");
    this.bucket.grantReadWrite(user);

    const accessKey = new AccessKey(this, "PrerenderAccessKey", {
      user: user,
      serial: 1,
    });

    const vpcLookup = props.vpcId
      ? { vpcId: props.vpcId }
      : { isDefault: true };
    const vpc = ec2.Vpc.fromLookup(this, "vpc", vpcLookup);

    const cluster = new ecs.Cluster(this, `${props.prerenderName}-cluster`, {
      vpc: vpc,
    });

    const directory = path.join(__dirname, "prerender");
    const asset = new ecrAssets.DockerImageAsset(
      this,
      `${props.prerenderName}-image`,
      {
        directory,
      }
    );

     /**
         * This provide backward compatibility for the tokenList property
         * If tokenUrlAssociation is provided, tokenList will be ignored
         */
     const tokenList = props.tokenUrlAssociation ? Object.keys(props.tokenUrlAssociation.tokenUrlAssociation) : props.tokenList.toString();

    // Create a load-balanced Fargate service
    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(
        this,
        `${props.prerenderName}-service`,
        {
          cluster,
          serviceName: `${props.prerenderName}-service`,
          desiredCount: props.desiredInstanceCount || 1,
          cpu: props.instanceCPU || 512, // 0.5 vCPU default
          memoryLimitMiB: props.instanceMemory || 1024, // 1 GB default to give Chrome enough memory
          taskImageOptions: {
            image: ecs.ContainerImage.fromDockerImageAsset(asset),
            enableLogging: true,
            containerPort: 3000,
            environment: {
              S3_BUCKET_NAME: this.bucket.bucketName,
              AWS_ACCESS_KEY_ID: accessKey.accessKeyId,
              AWS_SECRET_ACCESS_KEY: accessKey.secretAccessKey.unsafeUnwrap(),
              AWS_REGION: Stack.of(this).region,
              ENABLE_REDIRECT_CACHE: props.enableRedirectCache || "false",
              TOKEN_LIST: tokenList.toString(),
            },
          },
          healthCheckGracePeriod: Duration.seconds(20),
          publicLoadBalancer: true,
          assignPublicIp: true,
          listenerPort: 443,
          redirectHTTP: true,
          domainName: props.domainName,
          domainZone: new HostedZone(this, "hosted-zone", {
            zoneName: props.domainName,
          }),
          certificate: Certificate.fromCertificateArn(
            this,
            "cert",
            props.certificateArn
          ),
        }
      );

    // As the prerender service will return a 401 on all unauthorised requests
    // it should be considered healthy when receiving a 401 response
    fargateService.targetGroup.configureHealthCheck({
      path: "/health",
      interval: Duration.seconds(120),
      unhealthyThresholdCount: 5,
      healthyHttpCodes: "401",
    });

        // Setup AutoScaling policy
        const scaling = fargateService.service.autoScaleTaskCount({
            maxCapacity: props.maxInstanceCount || 2,
        });
        scaling.scaleOnCpuUtilization(`${props.prerenderName}-scaling`, {
            targetUtilizationPercent: 50,
            scaleInCooldown: Duration.seconds(60),
            scaleOutCooldown: Duration.seconds(60),
        });

            /**
     * Enable VPC Endpoints for S3
     * This would  create S3 endpoints in all the PUBLIC subnets of the VPC
     */
    if (props.enableS3Endpoint) {
        vpc.addGatewayEndpoint("S3Endpoint", {
          service: ec2.GatewayVpcEndpointAwsService.S3,
          subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
        });
      }
      
        /**
         * Recache API
         * Recaching is enable by default
         */
        if (props.tokenUrlAssociation) {
            /**
             * Create the token-url association
             * This is used for managing prerender tokens in prerender re-caching.
             * Example:
             *  {
             *      tokenUrlAssociation: {
             *          token1: [url1, url2], 
             *          token2: [url3, url4]}, 
             *      ssmPathPrefix: /prerender/recache/tokens
             *  }
             */
            new PrerenderTokensUrlAssociation(this, `${props.prerenderName}-token-url-association`, {
                tokenUrlAssociation: props.tokenUrlAssociation.tokenUrlAssociation,
                ssmPathPrefix: props.tokenUrlAssociation.ssmPathPrefix
            });
            
            /**
             * Create the recache API
             * This would create the API that can be used to trigger recaching of URLs.
             */
            new PrerenderRecacheApi(this, `${props.prerenderName}-recache-api`, {
                prerenderS3Bucket: this.bucket,
                tokenList: Object.keys(props.tokenUrlAssociation.tokenUrlAssociation), 
            });
        }
    }
}