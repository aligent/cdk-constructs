import { CfnOutput } from "aws-cdk-lib";
import { SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import {
  ARecord,
  CnameRecord,
  PrivateHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

const DEFAULT_ZONE_RECORD_SUFFIX = "root";

export type Zone = {
  type: string;
  target: string;
  record?: string;
};

export interface SharedVpcProps {
  /**
   * The name we should use to create the VPC and prefix it's resources with
   */
  vpcName: string;
  /**
   * The optional CIDR address
   */
  cidr?: string;
  /**
   * The optional domain to use for the hosted-zone
   */
  hostedZoneDomain?: string;
  /**
   * Optional zone records
   */
  hostedZoneRecords?: Zone[];
}

export class SharedVpc extends Construct {
  public readonly vpc: Vpc;
  public readonly privateHostedZone: PrivateHostedZone;

  constructor(scope: Construct, id: string, props: SharedVpcProps) {
    super(scope, id);
    const { vpcName, cidr, hostedZoneDomain, hostedZoneRecords } = props;

    this.vpc = new Vpc(this, vpcName, {
      maxAzs: 2,
      cidr: cidr || Vpc.DEFAULT_CIDR_RANGE,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 22,
          name: `${vpcName}-subnet-private`,
          subnetType: SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 22,
          name: `${vpcName}-subnet-public`,
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    // Export the VPC ID
    new CfnOutput(this, "vpc", {
      value: this.vpc.vpcId,
      exportName: `${vpcName}-vpc`,
    });

    // Export each subnet from this VPC
    this.vpc.privateSubnets.forEach((subnet, index) => {
      const id = index + 1;
      new CfnOutput(this, `private-subnet-${id}`, {
        value: subnet.subnetId,
        exportName: `${vpcName}-private-subnet-${id}`,
      });
    });
    this.vpc.publicSubnets.forEach((subnet, index) => {
      const id = index + 1;
      new CfnOutput(this, `public-subnet-${id}`, {
        value: subnet.subnetId,
        exportName: `${vpcName}-public-subnet-${id}`,
      });
    });

    // Generate DNS records for each hosted zone
    if (hostedZoneDomain) {
      this.privateHostedZone = new PrivateHostedZone(
        this,
        `${vpcName}-hosted-zone`,
        {
          zoneName: hostedZoneDomain,
          vpc: this.vpc,
        }
      );

      if (hostedZoneRecords?.length) {
        for (const zone of hostedZoneRecords) {
          const recordId = `${vpcName}-hosted-zone-record-${
            zone.record || DEFAULT_ZONE_RECORD_SUFFIX
          }`;
          switch (zone.type) {
            case "A": {
              new ARecord(this, recordId, {
                zone: this.privateHostedZone,
                target: RecordTarget.fromIpAddresses(zone.target),
              });
              break;
            }
            case "CNAME": {
              new CnameRecord(this, recordId, {
                zone: this.privateHostedZone,
                domainName: zone.target,
                recordName: zone.record,
              });
              break;
            }
            default: {
              throw Error(`${zone.type} is not supported`);
            }
          }
        }
      }

      // Export the hosted zone
      new CfnOutput(this, "hosted-zone", {
        value: this.privateHostedZone.hostedZoneId,
        exportName: `${vpcName}-hosted-zone`,
      });
    }
  }
}
