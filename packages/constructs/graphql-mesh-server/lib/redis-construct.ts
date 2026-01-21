import { SecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import {
  CfnCacheCluster,
  CfnSubnetGroup,
  CfnParameterGroup,
} from "aws-cdk-lib/aws-elasticache";
import { CfnOutput, Token } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface RedisServiceProps {
  /**
   * VPC to attach Redis instance to
   */
  vpc: IVpc;
  /**
   * Cache node type (default: 'cache.t2.micro')
   */
  cacheNodeType?: string;
}

export class RedisService extends Construct {
  public readonly cacheCluster: CfnCacheCluster;
  public readonly vpc: IVpc;
  public readonly securityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: RedisServiceProps) {
    super(scope, id);

    this.vpc = props.vpc;

    this.securityGroup = new SecurityGroup(this, "RedisSecurityGroup", {
      vpc: this.vpc,
    });

    const privateSubnets: string[] = this.vpc.privateSubnets.map(subnet => {
      return subnet.subnetId;
    });

    const cacheSubnetGroup = new CfnSubnetGroup(this, "CacheSubnetGroup", {
      description: "Subnet Group for Mesh Cache",
      subnetIds: privateSubnets,
    });

    const cacheParameterGroup = new CfnParameterGroup(
      this,
      "CacheParameterGroup",
      {
        cacheParameterGroupFamily: "redis7",
        description: "Parameter Group for Mesh Cache",
        properties: {
          "maxmemory-policy": "allkeys-lru",
        },
      }
    );

    this.cacheCluster = new CfnCacheCluster(this, "cache-cluster", {
      cacheNodeType: props.cacheNodeType || "cache.t2.micro",
      engine: "redis",
      numCacheNodes: 1,
      autoMinorVersionUpgrade: true,
      vpcSecurityGroupIds: [this.securityGroup.securityGroupId],
      cacheSubnetGroupName: cacheSubnetGroup.ref,
      cacheParameterGroupName: cacheParameterGroup.ref,
    });

    this.cacheCluster.addDependency(cacheParameterGroup);
    this.cacheCluster.addDependency(cacheSubnetGroup);

    new CfnOutput(this, "RedisConnectionString", {
      description: "RedisConnectionString",
      value: this.cacheConnectionString,
    });
  }

  public get cacheConnectionString(): string {
    return `redis://${this.cacheCluster
      .getAtt("RedisEndpoint.Address")
      .toString()}:${this.cacheCluster
      .getAtt("RedisEndpoint.Port")
      .toString()}`;
  }

  public get connectionEndPoint(): string {
    return Token.asString(this.cacheCluster.getAtt("RedisEndpoint.Address"));
  }

  public get connectionPort(): number {
    return Token.asNumber(this.cacheCluster.getAtt("RedisEndpoint.Port"));
  }
}
