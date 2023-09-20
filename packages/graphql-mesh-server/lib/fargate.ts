import { Construct } from 'constructs';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as auto_scaling from 'aws-cdk-lib/aws-autoscaling';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { RedisService } from './redis-construct';
import { ManagedRule, Scope, WebApplicationFirewall } from './web-application-firewall';

export interface MeshServiceProps {
    /**
     * Name of the read only role used to access logs (default: graphql-mesh-read-only-role)
     */
    readOnlyRoleName?: string;
    /**
     * ARN of the account to allow access to assume role from
     * If provided a read only user will be created
     */
    awsAccountArn?: string;
    /**
     * VPC to attach Redis instance to
     */
    vpc?: Vpc;
    /**
     * Repository to pull the container image from 
     */
    repository?: ecr.Repository;
    /**
     * ARN of the certificate to add to the load balancer
     */
    certificateArn: string;
    /**
     * Minimum number of Fargate instances
     */
    minCapacity?: number;
    /**
     * Maximum number of Fargate instances
     */
    maxCapacity?: number;
    /**
     * Amount of vCPU per instance (default: 512)
     */
    cpu?: number;
    /**
     * Amount of memory per instance (default: 1024)
     */
    memory?: number;
    /**
     * Redis instance to use for mesh caching
     */
    redis: RedisService;
    /**
     * SSM values to pass through to the container as secrets
     */
    secrets?: {[key: string]: ssm.IStringParameter | ssm.IStringListParameter};
}

export class MeshService extends Construct {
    public readonly vpc: Vpc;
    public readonly repository: ecr.Repository;
    public readonly service: ecs.FargateService;
    public readonly firewall: WebApplicationFirewall;

    constructor(scope: Construct, id: string, props: MeshServiceProps) {
        super(scope, id);

        const certificate = acm.Certificate.fromCertificateArn(
            this,
            `certificate`,
            props.certificateArn
        );

        this.vpc =
            props.vpc ||
            new Vpc(this, 'vpc', {
                natGateways: 1,
            });

        this.repository =
            props.repository ||
            new ecr.Repository(this, 'repo', {
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteImages: true,
            });

        if (!props.repository) {
            // Delete all images older than 90 days BUT keep 10 from the latest tag
            this.repository.addLifecycleRule({
                tagPrefixList: ['latest'],
                maxImageCount: 10,
            });
            this.repository.addLifecycleRule({
                maxImageAge: Duration.days(90),
            });
        }

        // Create a deploy user to push images to ECR
        const deployUser = new iam.User(this, 'deploy-user');

        const deployPolicy = new iam.Policy(this, 'deploy-policy');
        deployPolicy.addStatements(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'ecr:CompleteLayerUpload',
                    'ecr:UploadLayerPart',
                    'ecr:InitiateLayerUpload',
                    'ecr:BatchCheckLayerAvailability',
                    'ecr:PutImage',
                ],
                resources: [this.repository.repositoryArn],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['ecr:GetAuthorizationToken'],
                resources: ['*'],
            })
        );

        deployUser.attachInlinePolicy(deployPolicy);

        const securityGroup = new SecurityGroup(this, 'security-group', {
            vpc: this.vpc,
        });

        const cluster = new ecs.Cluster(this, `cluster`, {
            vpc: this.vpc,
        });

        const environment: { [key: string]: string } = {};

        // If using Redis configure security group and pass connection string to container
        if (props.redis) {
            props.redis.securityGroup.addIngressRule(
                securityGroup,
                Port.tcp(props.redis.connectionPort)
            );

            environment['REDIS_ENDPOINT'] = props.redis.connectionEndPoint;
            environment['REDIS_PORT'] = props.redis.connectionPort.toString();
        }

        // Construct secrets from provided ssm values
        const secrets: {[key: string]: ecs.Secret} = {};
        props.secrets = props.secrets || {};
        for (const [key, ssm] of Object.entries(props.secrets)) {
            secrets[key] = ecs.Secret.fromSsmParameter(ssm);
        }

        const logGroup = new logs.LogGroup(this, "log-group");

        // Create a load-balanced Fargate service and make it public
        const fargateService =
            new ecsPatterns.ApplicationLoadBalancedFargateService(
                this,
                `fargate`,
                {
                    cluster,
                    certificate,
                    enableExecuteCommand: true,
                    cpu: props.cpu || 512, // 0.5 vCPU
                    memoryLimitMiB: props.memory || 1024, // 1 GB
                    taskImageOptions: {
                        image: ecs.ContainerImage.fromEcrRepository(
                            this.repository
                        ),
                        enableLogging: true, // default
                        containerPort: 4000, // graphql mesh gateway port
                        secrets: secrets,
                        environment: environment,
                        logDriver: new ecs.AwsLogDriver({
                            logGroup: logGroup,
                            streamPrefix: "mesh",
                        }),
                    },
                    publicLoadBalancer: true, // default,
                    taskSubnets: {
                        subnets: [...this.vpc.privateSubnets],
                    },
                    securityGroups: [securityGroup],
                }
            );

        this.service = fargateService.service;

        this.firewall = new WebApplicationFirewall(this, 'waf', {
            scope: Scope.REGIONAL,
            visibilityConfig: {
                cloudWatchMetricsEnabled: true,
                metricName: "firewall-request",
                sampledRequestsEnabled: true
            },
            managedRules: [
                {
                    name: ManagedRule.COMMON_RULE_SET,
                    excludedRules: [
                {
                            name: 'SizeRestrictions_QUERYSTRING'
                        }
                    ]
                },
                {
                    name: ManagedRule.KNOWN_BAD_INPUTS_RULE_SET,
                }
            ]
        });

        this.firewall.addAssociation('loadbalancer-association', fargateService.loadBalancer.loadBalancerArn);

        fargateService.targetGroup.configureHealthCheck({
            path: '/healthcheck',
        });

        // Setup auto scaling policy
        const scaling = fargateService.service.autoScaleTaskCount({
            minCapacity: props.minCapacity || 1,
            maxCapacity: props.maxCapacity || 5,
        });

        const cpuUtilization = fargateService.service.metricCpuUtilization();
        scaling.scaleOnMetric('auto-scale-cpu', {
            metric: cpuUtilization,
            scalingSteps: [
                { upper: 30, change: -1 },
                { lower: 50, change: +1 },
                { lower: 85, change: +3 },
            ],
            adjustmentType: auto_scaling.AdjustmentType.CHANGE_IN_CAPACITY,
        });

        // Cross account role to get read only access to mesh
        // and the relevant logs
        if (props.awsAccountArn) {
        const readOnlyRoleName = props.readOnlyRoleName || 'graphql-mesh-read-only-role';
        const readOnlyRole = new iam.Role(this, "read-only-role", {
            assumedBy: new iam.AccountPrincipal(props.awsAccountArn),
            description: "Read Only Role for Mesh Developers",
            roleName: readOnlyRoleName,
        });
        
        const readOnlyPolicy = new iam.ManagedPolicy(this, "read-only-policy");
        readOnlyPolicy.addStatements(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "logs:Describe*",
                    "logs:Get*",
                    "logs:List*",
                    "logs:StartQuery",
                    "logs:StopQuery",
                    "logs:TestMetricFilter",
                    "logs:FilterLogEvents",
                    "logs:StartLiveTail",
                    "logs:StopLiveTail",
                ],
                resources: [logGroup.logGroupArn],
            }),
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    "ecs:DescribeClusters",
                    "ecs:DescribeServices",
                    "ecs:DescribeTasks",
                    "ecs:DescribeTaskDefinition",
                    "esc:DescribeContainerInstances",
                    "ecs:ListClusters",
                    "ecs:ListContainerInstances",
                    "ecs:ListServices",
                    "ecs:ListTaskDefinitions",
                    "ecs:ListTasks",
                ],
                resources: ["*"],
            })
        );

        readOnlyRole.addManagedPolicy(readOnlyPolicy);

        new CfnOutput(this, "read-only-role-arn", {
            description: "ReadOnlyRoleArn",
            value: readOnlyRole.roleArn,
        });
        }
    }
}
