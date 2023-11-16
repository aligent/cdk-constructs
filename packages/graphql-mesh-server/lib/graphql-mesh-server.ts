import { Construct } from "constructs";
import { MeshService } from "./fargate";
import { RedisService } from "./redis-construct";
import { CodePipelineService } from "./pipeline";
import { SecurityGroup, IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { AWSManagedRule } from "./web-application-firewall";
import { CfnWebACL } from "aws-cdk-lib/aws-wafv2";

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
  /**
   * ARN of the SNS Topic to send deployment notifications to
   */
  notificationArn?: string;
  /**
   * List of IP addresses to block (currently only support IPv4)
   */
  blockedIps?: string[];
  /**
   * The waf rule priority.
   * Defaults to 2
   */
  blockedIpPriority?: number;
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
};

export class MeshHosting extends Construct {
  public readonly vpc: IVpc;
  public readonly repository: Repository;
  public readonly service: FargateService;
  public readonly cacheCluster: CfnCacheCluster;
  public readonly securityGroup: SecurityGroup;

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
    this.repository = mesh.repository;

    new CodePipelineService(this, "pipeline", {
      repository: this.repository,
      service: this.service,
      notificationArn: props.notificationArn,
    });
  }
}
