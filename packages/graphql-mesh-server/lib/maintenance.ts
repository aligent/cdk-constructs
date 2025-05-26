import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { IVpc, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { FileSystem } from "aws-cdk-lib/aws-efs";
import { FargateService, MountPoint } from "aws-cdk-lib/aws-ecs";
import * as path from "path";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

interface MaintenanceProps {
  /**
   * VPC to mount the EFS volume on
   * Should be the same VPC as the Fargate container
   */
  vpc: IVpc;

  /**
   * Task definition to mount to the EFS volume to
   */
  fargateService: FargateService;

  /**
   * Path to mount the efs volume to
   *
   * @default '/mnt/efs0'
   */
  mountPath?: string;

  /**
   * Authentication key for the maintenance API
   *
   * @default randomly generated key
   */
  authKey?: string;
}

export class Maintenance extends Construct {
  constructor(scope: Construct, id: string, props: MaintenanceProps) {
    super(scope, id);

    const efsVolumeSecGroup = new SecurityGroup(this, "efs-security-group", {
      vpc: props.vpc,
    });
    const efsVolume = new FileSystem(this, "efs", {
      vpc: props.vpc,
      allowAnonymousAccess: false,
      removalPolicy: RemovalPolicy.DESTROY, // Nothing import is stored here, fine to destroy
      securityGroup: efsVolumeSecGroup,
    });
    const accessPoint = efsVolume.addAccessPoint("access-point", {
      createAcl: {
        ownerGid: "1001",
        ownerUid: "1001",
        permissions: "750",
      },
      path: "/export/maintenance",
      posixUser: {
        gid: "1001",
        uid: "1001",
      },
    });
    const efsVolumeMountPath = props.mountPath || "/mnt/efs0";

    const accessPolicy = new PolicyStatement({
      actions: [
        "elasticfilesystem:ClientMount",
        "elasticfilesystem:ClientWrite",
        "elasticfilesystem:ClientRootAccess",
      ],
      resources: [efsVolume.fileSystemArn, accessPoint.accessPointArn],
    });

    efsVolumeSecGroup.addIngressRule(
      Peer.ipv4(props.vpc.vpcCidrBlock),
      Port.tcp(2049),
      "File access"
    );

    efsVolume.grantReadWrite(props.fargateService.taskDefinition.taskRole);
    props.fargateService.taskDefinition.addToTaskRolePolicy(accessPolicy);

    props.fargateService.taskDefinition.addVolume({
      name: "maintenanceVolume",
      efsVolumeConfiguration: {
        ...efsVolume,
        transitEncryption: "ENABLED",
        authorizationConfig: {
          accessPointId: accessPoint.accessPointId,
          iam: "ENABLED",
        },
      },
    });

    const mountPoint: MountPoint = {
      containerPath: efsVolumeMountPath,
      readOnly: true,
      sourceVolume: "maintenanceVolume",
    };
    props.fargateService.taskDefinition
      .findContainer("mesh")
      ?.addMountPoints(mountPoint);
    props.fargateService.taskDefinition
      .findContainer("mesh")
      ?.addEnvironment(
        "MAINTENANCE_FILE_PATH",
        `${efsVolumeMountPath}/maintenance.enabled`
      );

    const api = new apigateway.RestApi(this, "maintenance-apigw");
    const apiKey = api.addApiKey("maintenance-api-key", {
      value: props.authKey,
    });
    const usagePlan = api.addUsagePlan("maintenance-usage-plan", {
      apiStages: [{ api: api, stage: api.deploymentStage }],
    });
    usagePlan.addApiKey(apiKey);

    const methodOptions: apigateway.MethodOptions = {
      apiKeyRequired: true,
    };

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
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        accessPoint,
        efsVolumeMountPath
      ),
      environment: {
        MAINTENANCE_FILE_PATH: efsVolumeMountPath,
      },
      vpc: props.vpc,
    });
    const maintenanceInt = new apigateway.LambdaIntegration(maintenanceLambda);
    maintenance.addMethod("GET", maintenanceInt, methodOptions);
    maintenance.addMethod("POST", maintenanceInt, methodOptions);

    const whitelist = maintenance.addResource("whitelist");
    const whitelistLambda = new NodejsFunction(this, "whitelist-lambda", {
      entry: path.resolve(
        __dirname,
        "../assets/handlers/maintenance/whitelist.ts"
      ),
      description: "Lambda to manage the maintenance whitelist",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      timeout: Duration.seconds(5),
      filesystem: lambda.FileSystem.fromEfsAccessPoint(
        accessPoint,
        efsVolumeMountPath
      ),
      environment: {
        MAINTENANCE_FILE_PATH: efsVolumeMountPath,
      },
      vpc: props.vpc,
    });
    const whitelistInt = new apigateway.LambdaIntegration(whitelistLambda);
    whitelist.addMethod("GET", whitelistInt, methodOptions);
    whitelist.addMethod("PUT", whitelistInt, methodOptions);
    whitelist.addMethod("PATCH", whitelistInt, methodOptions);
  }
}
