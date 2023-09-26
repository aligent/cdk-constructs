import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import { AccessKey, User } from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as path from 'path';

/**
 * Options for configuring a Prerender Fargate service.
 */
export interface PrerenderOptions {
    /**
     * The name of the Prerender service.
     */
    prerenderName: string;
    /** 
     * The domain name to use for the Prerender service. 
     */
    domainName: string;
    /** 
     * The ID of the VPC. 
     */
    vpcId?: string;
    /** 
     * The name of the S3 bucket to use for storing Prerender data. 
     */
    bucketName?: string;
    /** 
     * The number of days to keep Prerender data before expiring it. 
     */
    expirationDays?: number;
    /** 
     * A list of tokens to use for authenticating requests to the Prerender service. 
     */
    tokenList: Array<string>;
    /** 
     * The ARN of the SSL certificate to use for the Prerender service. 
     */
    certificateArn: string;
    /** 
     * The desired number of instances in the ECS cluster. 
     */
    desiredInstanceCount?: number;
    /** 
     * The maximum number of instances in the ECS cluster. 
     */
    maxInstanceCount?: number;
    /** 
     * The amount of CPU to allocate to each instance. 
     */
    instanceCPU?: number;
    /** 
     * The amount of memory to allocate to each instance. 
     */
    instanceMemory?: number;
    /** 
     * Whether to enable caching of redirects in the Prerender service. 
     */
    enableRedirectCache?: string;
    /** 
     * Whether to create a new VPC for the Prerender service. 
     */
    createVpc: boolean;
  }

export class PrerenderFargate extends Construct {
    readonly bucket: Bucket;

    constructor(scope: Construct, id: string, props: PrerenderOptions) {
        super(scope, id);

        // Create bucket for prerender storage
        this.bucket = new Bucket(this, `${props.prerenderName}-bucket`, {
            bucketName: props.bucketName,
            lifecycleRules: [{
                enabled: true,
                expiration: Duration.days(props.expirationDays || 7) // Default to 7 day expiration
            }],
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        });

        // Configure access to the bucket for the container
        const user = new User(this, 'PrerenderAccess');
        this.bucket.grantReadWrite(user);

        const accessKey = new AccessKey(this, 'PrerenderAccessKey', {
            user: user,
            serial: 1
        });

        let vpc!: ec2.IVpc;
        // Create a new VPC or use an existing one
        if (props.createVpc) {
            vpc = new ec2.Vpc(this, `${props.prerenderName}-vpc`, {
                maxAzs: 2,
                subnetConfiguration: [
                    {
                        name: 'public',
                        subnetType: ec2.SubnetType.PUBLIC,
                    },
                    {
                        name: 'private',
                        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    },
                ],
            });
        } else {
            const vpcLookup = { vpcId: props.vpcId };
            vpc = ec2.Vpc.fromLookup(this, "vpc", vpcLookup); 
        }

        const cluster = new ecs.Cluster(this, `${props.prerenderName}-cluster`, { vpc: vpc });

        const directory = path.join(__dirname, 'prerender');
        const asset = new ecrAssets.DockerImageAsset(this, `${props.prerenderName}-image`, {
            directory,
        });

        // Create a load-balanced Fargate service 
        const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
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
                        AWS_SECRET_ACCESS_KEY: accessKey.secretAccessKey.unsafeUnwrap().toString(),
                        AWS_REGION: Stack.of(this).region,
                        ENABLE_REDIRECT_CACHE: props.enableRedirectCache || "false",
                        TOKEN_LIST: props.tokenList.toString()
                    }
                },
                healthCheckGracePeriod: Duration.seconds(20),
                publicLoadBalancer: true,
                assignPublicIp: true,
                listenerPort: 443,
                redirectHTTP: true,
                domainName: props.domainName,
                domainZone: new HostedZone(this, 'hosted-zone', { zoneName: props.domainName }),
                certificate: Certificate.fromCertificateArn(this, 'cert', props.certificateArn)
            }
        );

        // As the prerender service will return a 401 on all unauthorised requests
        // it should be considered healthy when receiving a 401 response
        fargateService.targetGroup.configureHealthCheck({
            path: "/health",
            interval: Duration.seconds(120),
            unhealthyThresholdCount: 5,
            healthyHttpCodes: '401'
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
    }
}
