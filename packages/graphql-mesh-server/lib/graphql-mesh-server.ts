import { Construct } from "constructs";
import { MeshService, MeshServiceProps } from "./fargate";
import { RedisService } from "./redis-construct";
import { CodePipelineService } from "./pipeline";
import { SecurityGroup, IVpc, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Cluster, FargateService } from "aws-cdk-lib/aws-ecs";
import { CfnCacheCluster } from "aws-cdk-lib/aws-elasticache";
import { WebApplicationFirewall } from "./web-application-firewall";
import { PerformanceMetrics } from "./metrics";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Alarm } from "aws-cdk-lib/aws-cloudwatch";
import { Maintenance } from "./maintenance";
import { TemporaryEnvironment } from "./temporary-environments";

export interface MeshHostingProps extends Omit<MeshServiceProps, "redis"> {
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
   * Redis configuration to use for mesh caching
   */
  redis?: {
    service: RedisService;
    database?: string;
  };
  /**
   * ARN of the SNS Topic to send deployment notifications to
   */
  notificationArn?: string;
  /**
   * Region of the SNS Topic that deployment notifications are sent to
   */
  notificationRegion?: string;
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

  /**
   * Specify a name for the dashboard
   *
   * @default - AWS Generated name
   */
  dashboardName?: string;

  /**
   * Whether mesh feature environments be enabled
   *
   * @default - false
   */
  temporaryEnvironments?: boolean;

  targetUtilizationPercent?: number;
}

export class MeshHosting extends Construct {
  public readonly vpc: IVpc;
  public readonly repository: Repository;
  public readonly cluster: Cluster;
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

    this.cluster = mesh.cluster;
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

    if (props.temporaryEnvironments) {
      new TemporaryEnvironment(this, "temporary-environments", {
        cluster: this.cluster,
        repository: this.repository,
        securityGroup: mesh.securityGroup,
        loadBalancer: this.loadBalancer,
      });
    }
  }
}
