import { Construct } from "constructs";
import { MeshService } from "./fargate";
import { RedisService } from "./redis-construct";
import { CodePipelineService } from "./pipeline";
import { SecurityGroup, IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import * as ssm from "aws-cdk-lib/aws-ssm";
import {
  AWSManagedRule,
  WebApplicationFirewall,
} from "./web-application-firewall";
import { CfnWebACL } from "aws-cdk-lib/aws-wafv2";
import { ScalingInterval } from "aws-cdk-lib/aws-autoscaling";
import { PerformanceMetrics } from "./metrics";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Alarm } from "aws-cdk-lib/aws-cloudwatch";
import { Maintenance } from "./maintenance";
import { Secret } from "aws-cdk-lib/aws-ecs";

export type MeshHostingProps = {
  /**
   * VPC to attach Redis and Fargate instances to (default: create a vpc)
   */
  vpc?: IVpc;
  /**
   * If no VPC is provided create one with this name (default: 'graphql-server-vpc')
   */
  vpcName?: string;
  /**
   * Cache node type (default: 'cache.t2.micro')
   */
  cacheNodeType?: string;
  /**
   * Repository to pull the container image from
   */
  repository?: Repository;
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
   * Amount of vCPU per Fargate instance (default: 512)
   */
  cpu?: number;
  /**
   * Amount of memory per Fargate instance (default: 1024)
   */
  memory?: number;
  /**
   * Redis configuration to use for mesh caching
   */
  redis?: {
    service: RedisService;
    database?: string;
  };
  /**
   * SSM values to pass through to the container as secrets
   */
  secrets?: { [key: string]: ssm.IStringParameter | ssm.IStringListParameter };

  secretsV2: { [key: string]: Secret };

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
   * ARN of the SNS Topic to send deployment notifications to
   */
  notificationArn?: string;
  /**
   * Region of the SNS Topic that deployment notifications are sent to
   */
  notificationRegion?: string;
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
   * List of IPv4 addresses that can bypass all WAF block lists.
   */
  allowedIps?: string[];
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
   * Optional sns topic to subscribe all alarms to
   */
  snsTopic?: Topic;
  /**
   * Any additional custom alarms
   */
  additionalAlarms?: Alarm[];

  /**
   * CloudFront distribution ID to clear cache on after a Mesh deploy.
   */
  cloudFrontDistributionId?: string;

  /**
   * If maintenance mode lambdas and efs volume should be created
   * @default true
   */
  enableMaintenanceMode?: boolean;

  /**
   * Maintenance auth key
   * @default true
   */
  maintenanceAuthKey?: string;

  /**
   * Whether a DynamoDB table should be created to store session data
   *
   * @default authentication-table
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
};

export class MeshHosting extends Construct {
  public readonly vpc: IVpc;
  public readonly repository: Repository;
  public readonly service: FargateService;
  public readonly loadBalancer: ApplicationLoadBalancer;
  public readonly logGroup: LogGroup;
  public readonly cacheCluster: CfnCacheCluster;
  public readonly securityGroup: SecurityGroup;
  public readonly firewall: WebApplicationFirewall;

  constructor(scope: Construct, id: string, props: MeshHostingProps) {
    super(scope, id);

    this.vpc =
      props.vpc ||
      new Vpc(this, "graphql-server-vpc", {
        vpcName: props.vpcName || "graphql-server-vpc",
        natGateways: 1,
      });

    const redis =
      props.redis?.service ||
      new RedisService(this, "redis", {
        ...props,
        vpc: this.vpc,
      });

    this.cacheCluster = redis.cacheCluster;
    this.securityGroup = redis.securityGroup;

    const mesh = new MeshService(this, "mesh", {
      ...props,
      vpc: this.vpc,
      redis: {
        service: redis,
        database: props.redis?.database,
      },
    });

    this.service = mesh.service;
    this.firewall = mesh.firewall;
    this.loadBalancer = mesh.loadBalancer;
    this.logGroup = mesh.logGroup;
    this.repository = mesh.repository;

    if (
      props.enableMaintenanceMode ||
      props.enableMaintenanceMode === undefined
    ) {
      new Maintenance(this, "maintenance", {
        ...props,
        vpc: this.vpc,
        fargateService: this.service,
        authKey: props.maintenanceAuthKey,
      });
    }

    new CodePipelineService(this, "pipeline", {
      repository: this.repository,
      service: this.service,
      notificationArn: props.notificationArn,
      notificationRegion: props.notificationRegion,
      cloudFrontDistributionId: props.cloudFrontDistributionId,
    });

    new PerformanceMetrics(this, "cloudwatch", {
      ...props,
      service: this.service,
      loadBalancer: this.loadBalancer,
      logGroup: this.logGroup,
      firewall: this.firewall,
    });
  }
}
