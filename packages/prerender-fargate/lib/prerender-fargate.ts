import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import { AccessKey, User } from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as path from 'path';

export interface PrerenderOptions {
    prerenderName: string,
    domainName: string,
    vpcId: string,
    bucketName?: string,
    expirationDays?: number,
    basicAuthList: Array<string[]>
}

export class PrerenderFargate extends Construct {
    constructor(scope: Construct, id: string, props: PrerenderOptions) {
        super(scope, id);

        // Create bucket for prerender storage
        const bucket = new Bucket(this, `${props.prerenderName}-bucket`, {
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
        bucket.grantReadWrite(user);

        const accessKey = new AccessKey(this, 'PrerenderAccessKey', {
            user: user,
            serial: 1
        });

        const vpc = ec2.Vpc.fromLookup(this, "vpc", { vpcId: props.vpcId });

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
                desiredCount: 1,
                cpu: 512, // 0.5 vCPU (this may need to be increased)
                memoryLimitMiB: 1024, // 1 GB to give Chrome enough memory
                taskImageOptions: {
                    image: ecs.ContainerImage.fromDockerImageAsset(asset),
                    enableLogging: true,
                    containerPort: 3000,
                    environment: {
                        S3_BUCKET_NAME: bucket.bucketName,
                        AWS_ACCESS_KEY_ID: accessKey.accessKeyId,
                        AWS_SECRET_ACCESS_KEY: accessKey.secretAccessKey.toString(),
                        AWS_REGION: Stack.of(this).region,
                        BASIC_AUTH: props.basicAuthList.toString()
                    }
                },
                healthCheckGracePeriod: Duration.seconds(20),
                publicLoadBalancer: true,
                assignPublicIp: true,
                listenerPort: 443,
                domainName: props.domainName
            }
        );

        // Setup AutoScaling policy
        const scaling = fargateService.service.autoScaleTaskCount({
            maxCapacity: 2,
        });
        scaling.scaleOnCpuUtilization(`${props.prerenderName}-scaling`, {
            targetUtilizationPercent: 50,
            scaleInCooldown: Duration.seconds(60),
            scaleOutCooldown: Duration.seconds(60),
        });
    }
}
