import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { FileSystem } from "aws-cdk-lib/aws-efs";
import path = require("path");

interface MaintenanceProps {
  vpc: IVpc;
}

export class Maintenance extends Construct {
  declare backend: lambda.Function;
  constructor(scope: Construct, id: string, props: MaintenanceProps) {
    super(scope, id);

    const efsVolume = new FileSystem(this, "efs", {
      vpc: props.vpc,
      allowAnonymousAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const api = new apigateway.RestApi(this, "maintenance-apigw");

    const maintenance = api.root.addResource("maintenance");
    const maintenanceLambda = new NodejsFunction(this, "maintenance-lambda", {
      entry: path.resolve(
        __dirname,
        "../assets/handlers/maintenance/maintenance.ts"
      ),
      description: "Lambda manage the maintenance mode status",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(5),
      filesystem: {
        config: {
          arn: efsVolume.fileSystemArn,
          localMountPath: "/efs-volume",
        },
      },
    });
    const maintenanceInt = new apigateway.LambdaIntegration(maintenanceLambda);
    maintenance.addMethod("GET", maintenanceInt);
    maintenance.addMethod("POST", maintenanceInt);
    maintenance.addResource("enable").addMethod("POST", maintenanceInt);
    maintenance.addResource("disable").addMethod("POST", maintenanceInt);

    const whitelist = api.root.addResource("whitelist");
    const whitelistLambda = new NodejsFunction(this, "", {
      entry: path.resolve(
        __dirname,
        "../assets/handlers/maintenance/whitelist.ts"
      ),
      description: "Lambda to manage the maintenance whitelist",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(5),
      filesystem: {
        config: {
          arn: efsVolume.fileSystemArn,
          localMountPath: "/efs-volume",
        },
      },
    });
    const whitelistInt = new apigateway.LambdaIntegration(whitelistLambda);
    whitelist.addMethod("GET", whitelistInt);
    whitelist.addMethod("PUT", whitelistInt);
  }
}
