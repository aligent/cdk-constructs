import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";
import { SecurityGroup, Vpc, Port } from "aws-cdk-lib/aws-ec2";
import { CfnBrokerProps, CfnBroker } from "aws-cdk-lib/aws-amazonmq";

export interface RabbitMQProps {
  rabbitMQProps: CfnBrokerProps;
  applicationVpcId: string;
  applicationSecurityGroupId: string;
}

export class RabbitMQ extends Construct {
  constructor(scope: Construct, id: string, props: RabbitMQProps) {
    super(scope, id);

    const sourceSecurityGroup = SecurityGroup.fromLookupById(
      this,
      id + "-sourceSecurityGroup",
      props.applicationSecurityGroupId
    );

    const applicationVpc = Vpc.fromLookup(this, id + "-applicationVpc", {
      vpcId: props.applicationVpcId,
    });

    const securityGroup = new SecurityGroup(this, id + "-securityGroup", {
      vpc: applicationVpc,
      allowAllOutbound: false,
    });

    securityGroup.addIngressRule(sourceSecurityGroup, Port.tcp(5671));
    securityGroup.addIngressRule(sourceSecurityGroup, Port.tcp(443));

    // Choose only one or two subnets out of all the available private ones
    const rabbitMqSubnets: string[] = [];
    if (props.rabbitMQProps.deploymentMode == "SINGLE_INSTANCE") {
      rabbitMqSubnets.push(applicationVpc.privateSubnets[0].subnetId);
    } else {
      rabbitMqSubnets.push(applicationVpc.privateSubnets[0].subnetId);
      rabbitMqSubnets.push(applicationVpc.privateSubnets[1].subnetId);
    }

    const rabbitMQ = new CfnBroker(this, id + "-rabbitMQBroker", {
      autoMinorVersionUpgrade: props.rabbitMQProps.autoMinorVersionUpgrade,
      brokerName: props.rabbitMQProps.brokerName,
      deploymentMode: props.rabbitMQProps.deploymentMode,
      engineType: props.rabbitMQProps.engineType,
      engineVersion: props.rabbitMQProps.engineVersion,
      hostInstanceType: props.rabbitMQProps.hostInstanceType,
      publiclyAccessible: props.rabbitMQProps.publiclyAccessible,
      users: props.rabbitMQProps.users,
      logs: props.rabbitMQProps.logs,
      maintenanceWindowStartTime:
        props.rabbitMQProps.maintenanceWindowStartTime,
      securityGroups: [securityGroup.securityGroupId],
      subnetIds: rabbitMqSubnets,
    });

    // Cfn does not respect .split(). We will get by with Arn for now.
    // const arn = rabbitmq.attrArn
    // const endpoint = arn.split(":", 7) + '.mq.' + this.region + '.amazonaws.com'
    new CfnOutput(this, rabbitMQ.brokerName + "Arn", {
      // value: rendpoint,
      value: rabbitMQ.attrArn,
      exportName: rabbitMQ.brokerName + "Arn",
    });
  }
}
