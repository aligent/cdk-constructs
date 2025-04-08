import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { RemovalPolicy } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Port, SecurityGroup, IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import { RedisService } from "./redis-construct";
import {
  AWSManagedRule,
  ManagedRule,
  Scope,
  WebApplicationFirewall,
} from "./web-application-firewall";
import { CfnIPSet, CfnWebACL } from "aws-cdk-lib/aws-wafv2";
import {
  ScalingInterval,
  AdjustmentType,
  BasicStepScalingPolicyProps,
} from "aws-cdk-lib/aws-autoscaling";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { MetricOptions } from "aws-cdk-lib/aws-cloudwatch";

export interface MeshServiceProps {
  /**
   * VPC to attach Fargate instance to
   */
  vpc?: IVpc;
  /**
   * Repository to pull the container image from
   */
  repository?: ecr.Repository;
  /**
   * ARN of the certificate to add to the load balancer
   */
  certificateArn?: string;
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
   * Redis configuration to use for mesh caching
   */
  redis: {
    service: RedisService;
    database?: string;
  };
  /**
   * SSM values to pass through to the container as secrets
   *
   * @deprecated - Use secrets instead
   */
  ssmSecrets?: {
    [key: string]: ssm.IStringParameter | ssm.IStringListParameter;
  };

  /**
   * ECS Secrets to pass through to the container as secrets
   *
   * The key values can be referenced from either SSM or Secrets manager
   */
  secrets?: { [key: string]: ecs.Secret };

  /**
   * Name of the WAF
   * Defaults to 'graphql-mesh-web-acl'
   */
  wafName?: string;
  /**
   * List of IPv4 addresses to block
   */
  blockedIps?: string[];
  /**
   * The waf rule priority.
   * Defaults to 2
   */
  blockedIpPriority?: number;
  /**
   * List of IPv6 addresses to block
   */
  blockedIpv6s?: string[];
  /**
   * The waf rule priority.
   * Defaults to 3
   */
  blockedIpv6Priority?: number;
  /**
   * If true, block all access to the endpoint. Use in conjunction with allowedIps to block public access
   * @default false
   */
  blockAll?: boolean;
  /**
   * List of AWS Managed rules to add to the WAF
   */
  wafManagedRules?: AWSManagedRule[];
  /**
   * List of custom rules
   */
  wafRules?: CfnWebACL.RuleProperty[];
  /**
   * The limit on requests per 5-minute period
   * If provided, rate limiting will be enabled
   */
  rateLimit?: number;
  /**
   * The waf rule priority. Only used when a rateLimit value is provided.
   * Defaults to 10
   */
  rateLimitPriority?: number;
  /**
   * The waf allowed ip rule priority.
   * Defaults to 2
   */
  allowedIpPriority?: number;
  /**
   * The waf allowed ip rule priority.
   * Defaults to 3
   */
  allowedIpv6Priority?: number;
  /**
   * List of IPv4 addresses that can bypass all WAF block lists.
   */
  allowedIps?: string[];
  /**
   * List of IPv6 addresses that can bypass all WAF block lists.
   */
  allowedIpv6s?: string[];
  /**
   * Pass custom cpu scaling steps
   * @default
   * [
   *    { upper: 30, change: -1 },
   *    { lower: 50, change: +1 },
   *    { lower: 85, change: +3 },
   * ]
   */
  cpuScalingSteps?: ScalingInterval[];
  /**
   * Enable / disable container insights
   * Defaults to true
   */
  containerInsights?: boolean;
  /**
   * Log stream prefix
   * Defaults to 'graphql-server'
   */
  logStreamPrefix?: string;
  /**
   * Whether a DynamoDB table should be created to store session data,
   * if not defined a table will not be created.
   * @default undefined
   */
  authenticationTable?: string;

  /**
   * Specify a name for the ECS cluster
   *
   * @default - AWS generated cluster name
   */
  clusterName?: string;

  /**
   * Specify a name for the GraphQL service
   *
   * @default - AWS generated service name
   */
  serviceName?: string;

  /**
   * Specify a name for the ECR repository
   *
   * @default - AWS generated repository name
   */
  repositoryName?: string;

  /**
   * Specify a name for the task definition family
   *
   * @default - AWS generated task definition family name
   */
  taskDefinitionFamilyName?: string;

  /**
   * Nginx image to use
   *
   * @default ecs.ContainerImage.fromRegistry("nginx:stable-alpine")
   */
  nginxImage?: ecs.ContainerImage;

  /**
   * Disable the nginx sidecar container
   *
   * @default - false
   */
  disableNginx?: boolean;

  /**
   * Optional manual overrides for nginx sidecar container
   */
  nginxConfigOverride?: Partial<ecs.ContainerDefinitionOptions>;

  /**
   * Override cpu scaling options
   *
   * @default
   * {
   *   period: Duration.minutes(1),
   *   statistic: "max",
   * }
   */
  cpuScalingOptions?: Partial<MetricOptions>;

  /**
   * Override cpu step scaling options
   *
   * @default
   * {
   *   metric: cpuUtilization, // use cpuScalingOptions to modify
   *   scalingSteps: cpuScalingSteps, // use cpuScalingSteps to modify
   *   adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY,
   *   evaluationPeriods: 3,
   *   datapointsToAlarm: 2,
   * }
   */
  cpuStepScalingOptions?: Partial<BasicStepScalingPolicyProps>;

  /**
   * Enable ECS Exec on the fargate containers
   * @default true
   */
  enableEcsExec?: boolean;
}

export class MeshService extends Construct {
  public readonly vpc: IVpc;
  public readonly repository: ecr.Repository;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: ApplicationLoadBalancer;
  public readonly logGroup: LogGroup;
  public readonly firewall: WebApplicationFirewall;

  constructor(scope: Construct, id: string, props: MeshServiceProps) {
    super(scope, id);

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(
          this,
          `certificate`,
          props.certificateArn
        )
      : undefined;

    if (!certificate) throw Error("Must pass certificate");

    this.vpc =
      props.vpc ||
      new Vpc(this, "vpc", {
        natGateways: 1,
      });

    this.repository =
      props.repository ||
      new ecr.Repository(this, "repo", {
        repositoryName:
          props.repositoryName !== undefined ? props.repositoryName : undefined,
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteImages: true,
      });

    if (!props.repository) {
      // Delete all images older than 90 days BUT keep 10 from the latest tag
      this.repository.addLifecycleRule({
        tagPrefixList: ["latest"],
        maxImageCount: 10,
      });
      this.repository.addLifecycleRule({
        maxImageAge: Duration.days(90),
      });
    }

    // Create a deploy user to push images to ECR
    const deployUser = new iam.User(this, "deploy-user");

    const deployPolicy = new iam.Policy(this, "deploy-policy");
    deployPolicy.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ecr:CompleteLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:InitiateLayerUpload",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
        ],
        resources: [this.repository.repositoryArn],
      }),
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      })
    );

    deployUser.attachInlinePolicy(deployPolicy);

    const securityGroup = new SecurityGroup(this, "security-group", {
      vpc: this.vpc,
    });

    const cluster = new ecs.Cluster(this, `cluster`, {
      vpc: this.vpc,
      containerInsights:
        props.containerInsights !== undefined ? props.containerInsights : true,
      clusterName:
        props.clusterName !== undefined ? props.clusterName : undefined,
    });

    const environment: { [key: string]: string } = {};

    // If using Redis configure security group and pass connection string to container
    if (props.redis) {
      props.redis.service.securityGroup.addIngressRule(
        securityGroup,
        Port.tcp(props.redis.service.connectionPort)
      );

      environment["REDIS_ENDPOINT"] = props.redis.service.connectionEndPoint;
      environment["REDIS_PORT"] = props.redis.service.connectionPort.toString();
      environment["REDIS_DATABASE"] = props.redis.database ?? "0";
    }

    // Construct secrets from provided ssm values
    const ssmSecrets: { [key: string]: ecs.Secret } = {};
    props.ssmSecrets = props.ssmSecrets || {};
    for (const [key, ssm] of Object.entries(props.ssmSecrets)) {
      ssmSecrets[key] = ecs.Secret.fromSsmParameter(ssm);
    }

    // Configure a custom log driver and group
    this.logGroup = new LogGroup(this, "graphql-server-log", {});
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: props.logStreamPrefix || "graphql-server",
      logGroup: this.logGroup,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: props.memory || 1024,
      cpu: props.cpu || 512,
    });

    // Configure nginx
    if (!props.disableNginx) {
      taskDefinition.addContainer("nginx", {
        image:
          props.nginxImage ||
          ecs.ContainerImage.fromAsset(
            path.resolve(__dirname, "../assets/nginx")
          ),
        containerName: "nginx",
        essential: true,
        healthCheck: {
          command: [
            "CMD-SHELL",
            "curl -f http://localhost || echo 'Health check failed'",
          ],
          startPeriod: Duration.seconds(5),
        },
        logging: logDriver,
        portMappings: [{ containerPort: 80 }],
        ...props.nginxConfigOverride,
      });
    }

    // Add the main mesh container
    taskDefinition.addContainer("mesh", {
      image: ecs.ContainerImage.fromEcrRepository(this.repository),
      containerName: "mesh",
      environment: environment,
      secrets: props.secrets ? props.secrets : ssmSecrets,
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost || echo 'Health check failed'",
        ],
        startPeriod: Duration.seconds(5),
      },
      logging: logDriver,
      portMappings: [{ containerPort: 4000 }], // Main application listens on port 4000
    });

    // Configure x-ray
    taskDefinition.addContainer("xray", {
      image: ecs.ContainerImage.fromRegistry("amazon/aws-xray-daemon"),
      cpu: 32,
      containerName: "xray",
      memoryReservationMiB: 256,
      essential: false,
      healthCheck: {
        command: ["CMD-SHELL", "pgrep xray || echo 'Health check failed'"],
        startPeriod: Duration.seconds(5),
      },
      portMappings: [{ containerPort: 4000, protocol: ecs.Protocol.UDP }],
    });

    // Create a load-balanced Fargate service and make it public
    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(this, `fargate`, {
        cluster,
        serviceName:
          props.serviceName !== undefined ? props.serviceName : undefined,
        certificate,
        enableExecuteCommand: props.enableEcsExec ?? true,
        cpu: props.cpu || 512, // 0.5 vCPU
        memoryLimitMiB: props.memory || 1024, // 1 GB
        taskDefinition: taskDefinition,
        publicLoadBalancer: true, // defult,
        taskSubnets: {
          subnets: [...this.vpc.privateSubnets],
        },
        securityGroups: [securityGroup],
      });

    this.service = fargateService.service;
    this.loadBalancer = fargateService.loadBalancer;

    taskDefinition.taskRole.addManagedPolicy({
      managedPolicyArn:
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    });
    taskDefinition.taskRole.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
    });

    if (props.authenticationTable) {
      const authTable = new dynamodb.Table(this, "authenticationTable", {
        tableName: props.authenticationTable || "authentication-table",
        partitionKey: {
          name: "customer_id",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "refresh_token_hash",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.DESTROY,
        timeToLiveAttribute: "ttl",
      });

      authTable.grantReadWriteData(this.service.taskDefinition.taskRole);
    }

    const allowedIpList = new CfnIPSet(this, "allowList", {
      addresses: props.allowedIps || [],
      ipAddressVersion: "IPV4",
      scope: "REGIONAL",
      description: "List of IPs that are whitelisted from rate limiting",
    });

    const blockedIpList = new CfnIPSet(this, "BlockedIpList", {
      addresses: props.blockedIps || [],
      ipAddressVersion: "IPV4",
      scope: "REGIONAL",
      description: "List of IPs blocked by WAF",
    });

    const allowedIpv6List = new CfnIPSet(this, "allowListIpv6", {
      addresses: props.allowedIpv6s || [],
      ipAddressVersion: "IPV6",
      scope: "REGIONAL",
      description: "List of IPv6s that are whitelisted from rate limiting",
    });

    const blockedIpv6List = new CfnIPSet(this, "BlockedIpv6List", {
      addresses: props.blockedIpv6s || [],
      ipAddressVersion: "IPV6",
      scope: "REGIONAL",
      description: "List of IPv6s blocked by WAF",
    });

    const defaultRules: CfnWebACL.RuleProperty[] = props.blockAll
      ? [
          {
            name: "BlockNonAllowedIps",
            priority: props.allowedIpPriority || 2,
            statement: {
              notStatement: {
                statement: {
                  orStatement: {
                    statements: [
                      {
                        ipSetReferenceStatement: {
                          arn: allowedIpList.attrArn,
                          ipSetForwardedIpConfig: {
                            fallbackBehavior: "MATCH",
                            headerName: "X-Forwarded-For",
                            position: "FIRST",
                          },
                        },
                      },
                      {
                        ipSetReferenceStatement: {
                          arn: allowedIpv6List.attrArn,
                          ipSetForwardedIpConfig: {
                            fallbackBehavior: "MATCH",
                            headerName: "X-Forwarded-For",
                            position: "FIRST",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IPAllowList",
              sampledRequestsEnabled: true,
            },
            action: {
              block: {},
            },
          },
        ]
      : [
          {
            name: "IPAllowList",
            priority: props.allowedIpPriority || 2,
            statement: {
              ipSetReferenceStatement: {
                arn: allowedIpList.attrArn,
                ipSetForwardedIpConfig: {
                  fallbackBehavior: "MATCH",
                  headerName: "X-Forwarded-For",
                  position: "FIRST",
                },
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IPAllowList",
              sampledRequestsEnabled: true,
            },
            action: {
              allow: {},
            },
          },
          {
            name: "IPv6AllowList",
            priority: props.allowedIpv6Priority || 3,
            statement: {
              ipSetReferenceStatement: {
                arn: allowedIpv6List.attrArn,
                ipSetForwardedIpConfig: {
                  fallbackBehavior: "MATCH",
                  headerName: "X-Forwarded-For",
                  position: "FIRST",
                },
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IPv6AllowList",
              sampledRequestsEnabled: true,
            },
            action: {
              allow: {},
            },
          },
          {
            name: "IPBlockList",
            priority: props.blockedIpPriority || 4,
            statement: {
              ipSetReferenceStatement: {
                arn: blockedIpList.attrArn,
                ipSetForwardedIpConfig: {
                  fallbackBehavior: "MATCH",
                  headerName: "X-Forwarded-For",
                  position: "FIRST",
                },
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IPBlockList",
              sampledRequestsEnabled: true,
            },
            action: {
              block: {},
            },
          },
          {
            name: "IPv6BlockList",
            priority: (props.blockedIpPriority || 4) + 1,
            statement: {
              ipSetReferenceStatement: {
                arn: blockedIpv6List.attrArn,
                ipSetForwardedIpConfig: {
                  fallbackBehavior: "MATCH",
                  headerName: "X-Forwarded-For",
                  position: "FIRST",
                },
              },
            },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "IPv6BlockList",
              sampledRequestsEnabled: true,
            },
            action: {
              block: {},
            },
          },
        ];

    if (props.rateLimit && !props.blockAll) {
      defaultRules.push({
        name: "RateLimit",
        priority: props.rateLimitPriority || 10,
        statement: {
          rateBasedStatement: {
            aggregateKeyType: "FORWARDED_IP",
            limit: props.rateLimit,
            forwardedIpConfig: {
              fallbackBehavior: "MATCH",
              headerName: "X-Forwarded-For",
            },
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "RateLimit",
          sampledRequestsEnabled: true,
        },
        action: {
          block: {},
        },
      });
    }

    this.firewall = new WebApplicationFirewall(this, "waf", {
      name: props.wafName,
      scope: Scope.REGIONAL,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "firewall-request",
        sampledRequestsEnabled: true,
      },
      managedRules: [
        {
          name: ManagedRule.COMMON_RULE_SET,
          excludedRules: [
            {
              name: "SizeRestrictions_QUERYSTRING",
            },
          ],
        },
        {
          name: ManagedRule.KNOWN_BAD_INPUTS_RULE_SET,
        },
        ...(props.wafManagedRules || []),
      ],
      rules: [...defaultRules, ...(props.wafRules || [])],
    });

    this.firewall.addAssociation(
      "loadbalancer-association",
      this.loadBalancer.loadBalancerArn
    );

    fargateService.targetGroup.configureHealthCheck({
      path: "/healthcheck",
    });

    // Setup auto scaling policy
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: props.minCapacity || 1,
      maxCapacity: props.maxCapacity || 5,
    });

    const cpuScalingSteps = props.cpuScalingSteps || [
      { upper: 30, change: -1 },
      { lower: 50, change: +1 },
      { lower: 85, change: +3 },
    ];

    // These default options are based on testing
    /// however they can be overwritten if required
    const cpuUtilization = this.service.metricCpuUtilization({
      period: Duration.minutes(1),
      statistic: "max",
      ...props.cpuScalingOptions,
    });

    scaling.scaleOnMetric("auto-scale-cpu", {
      metric: cpuUtilization,
      scalingSteps: cpuScalingSteps,
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      ...props.cpuStepScalingOptions,
    });
  }
}
