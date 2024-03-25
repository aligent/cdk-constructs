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
import { ScalingInterval, AdjustmentType } from "aws-cdk-lib/aws-autoscaling";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";

export interface MeshServiceProps {
  /**
   * VPC to attach Redis instance to
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
   */
  secrets?: { [key: string]: ssm.IStringParameter | ssm.IStringListParameter };
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
   * List of IPv4 addresses that can bypass all WAF block lists.
   */
  allowedIps?: string[];
  /**
   * Pass custom cpu scaling steps
   * Default value:
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
   * Whether a DynamoDB table should be created to store session data
   * @default authentication-table
   */
  authenticationTable?: string;
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

    this.vpc =
      props.vpc ||
      new Vpc(this, "vpc", {
        natGateways: 1,
      });

    this.repository =
      props.repository ||
      new ecr.Repository(this, "repo", {
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
    const secrets: { [key: string]: ecs.Secret } = {};
    props.secrets = props.secrets || {};
    for (const [key, ssm] of Object.entries(props.secrets)) {
      secrets[key] = ecs.Secret.fromSsmParameter(ssm);
    }

    // Configure a custom log driver and group
    this.logGroup = new LogGroup(this, "graphql-server-log", {});
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: props.logStreamPrefix || "graphql-server",
      logGroup: this.logGroup,
    });

    // Create a load-balanced Fargate service and make it public
    const fargateService =
      new ecsPatterns.ApplicationLoadBalancedFargateService(this, `fargate`, {
        cluster,
        certificate,
        enableExecuteCommand: true,
        cpu: props.cpu || 512, // 0.5 vCPU
        memoryLimitMiB: props.memory || 1024, // 1 GB
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(this.repository),
          enableLogging: true, // default
          containerPort: 4000, // graphql mesh gateway port
          secrets: secrets,
          environment: environment,
          logDriver: logDriver,
          taskRole: new iam.Role(this, "MeshTaskRole", {
            assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
          }),
        },
        publicLoadBalancer: true, // default,
        taskSubnets: {
          subnets: [...this.vpc.privateSubnets],
        },
        securityGroups: [securityGroup],
      });

    this.service = fargateService.service;
    this.loadBalancer = fargateService.loadBalancer;

    // Configure x-ray
    const xray = this.service.taskDefinition.addContainer("xray", {
      image: ecs.ContainerImage.fromRegistry("amazon/aws-xray-daemon"),
      cpu: 32,
      memoryReservationMiB: 256,
      essential: false,
      logging: logDriver,
    });
    xray.addPortMappings({
      containerPort: 2000,
      protocol: ecs.Protocol.UDP,
    });

    this.service.taskDefinition.taskRole.addManagedPolicy({
      managedPolicyArn:
        "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
    });
    this.service.taskDefinition.taskRole.addManagedPolicy({
      managedPolicyArn: "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
    });

    if (props.authenticationTable || props.authenticationTable === undefined) {
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
                  ipSetReferenceStatement: {
                    arn: allowedIpList.attrArn,
                    ipSetForwardedIpConfig: {
                      fallbackBehavior: "MATCH",
                      headerName: "X-Forwarded-For",
                      position: "FIRST",
                    },
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
            name: "IPBlockList",
            priority: props.blockedIpPriority || 3,
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
            priority: (props.blockedIpPriority || 3) + 1,
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
      fargateService.loadBalancer.loadBalancerArn
    );

    fargateService.targetGroup.configureHealthCheck({
      path: "/healthcheck",
    });

    // Setup auto scaling policy
    const scaling = fargateService.service.autoScaleTaskCount({
      minCapacity: props.minCapacity || 1,
      maxCapacity: props.maxCapacity || 5,
    });

    const cpuScalingSteps = props.cpuScalingSteps || [
      { upper: 30, change: -1 },
      { lower: 50, change: +1 },
      { lower: 85, change: +3 },
    ];

    const cpuUtilization = fargateService.service.metricCpuUtilization();
    scaling.scaleOnMetric("auto-scale-cpu", {
      metric: cpuUtilization,
      scalingSteps: cpuScalingSteps,
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY,
    });
  }
}
