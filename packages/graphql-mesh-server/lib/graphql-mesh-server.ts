import { Construct } from "constructs";
import { MeshService, MeshServiceProps } from "./fargate";
import { RedisService, RedisServiceProps } from "./redis-construct";
import { CodePipelineService } from "./pipeline";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import * as ssm from "aws-cdk-lib/aws-ssm";

export type MeshHostingProps = {
  /**
   * VPC to attach Redis and Fargate instances to (default: create a vpc)
   */
  vpc?: Vpc;
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
   * Redis instance to use for mesh caching
   */
  redis?: RedisService;
  /**
   * SSM values to pass through to the container as secrets
   */
  secrets?: { [key: string]: ssm.IStringParameter | ssm.IStringListParameter };
};

export class MeshHosting extends Construct {
  public readonly vpc: Vpc;
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
      props.redis ||
      new RedisService(this, "redis", {
        ...props,
        vpc: this.vpc,
      });

    this.cacheCluster = redis.cacheCluster;
    this.securityGroup = redis.securityGroup;

    const mesh = new MeshService(this, "mesh", {
      ...props,
      vpc: this.vpc,
      redis,
    });

    this.service = mesh.service;
    this.repository = mesh.repository;

    new CodePipelineService(this, "pipeline", {
      repository: this.repository,
      service: this.service,
    });
  }
}
