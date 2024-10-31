// TODO: create code pipeline to handle all this

// TODO: push to ECR

// TODO: create new task definition from this

// TODO: deploy new task to service

// TODO: create new target group

// TODO: update load balancer to point target ticket number url to service

// TODO: expire environment after one week (or configurable amount of time)

import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { Construct } from "constructs";
import { ApplicationLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as pipe_actions from "aws-cdk-lib/aws-codepipeline-actions";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";
import path = require("path");
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";

export interface TemporaryEnvironmentProps {
  cluster: Cluster;
  loadBalancer: ApplicationLoadBalancer;
  repository: Repository;
  securityGroup: SecurityGroup;
  pipelineName?: string;
}

export class TemporaryEnvironment extends Construct {
  public readonly pipeline: Pipeline;

  constructor(scope: Construct, id: string, props: TemporaryEnvironmentProps) {
    super(scope, id);

    const buildTaskLambda = new NodejsFunction(this, "deploy-temp-service", {
      entry: path.resolve(
        __dirname,
        "../assets/handlers/temporary-env/deploy-temp-service.ts"
      ),
      description: "Build a new task definition",
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.handler",
      timeout: Duration.seconds(45),
      environment: {
        cluster: props.cluster.clusterArn,
        subnet_1: props.cluster.vpc.publicSubnets.at(0)?.subnetId || "",
        subnet_2: props.cluster.vpc.publicSubnets.at(1)?.subnetId || "",
        security_group: props.securityGroup.securityGroupId,
        load_balancer: props.loadBalancer.loadBalancerArn,
      },
    });

    buildTaskLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "ecs:RegisterTaskDefinition",
          "iam:PassRole",
          "ecs:CreateService",
          "ecs:ListTasks",
          "elasticloadbalancing:CreateLoadBalancerListeners",
        ],
        resources: [
          // TODO: pass this through
          `arn:aws:ecs:REGION:ACCOUNT:service/${props.cluster.clusterName}/*`,
          `arn:aws:ecs:REGION:ACCOUNT:container-instance/${props.cluster.clusterName}/*`,
          props.loadBalancer.loadBalancerArn,
        ],
      })
    );

    // Configure the pipeline to update the service
    this.pipeline = new Pipeline(this, "deploy-pipeline", {
      pipelineName:
        props.pipelineName !== undefined ? props.pipelineName : undefined,
    });

    const sourceOutput = new Artifact();
    // Source the image and pass it to the Lambda
    const sourceAction = new pipe_actions.EcrSourceAction({
      actionName: "ECR",
      repository: props.repository,
      output: sourceOutput,
    });

    this.pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    this.pipeline.addStage({
      stageName: "Deploy",
      actions: [
        new pipe_actions.LambdaInvokeAction({
          lambda: buildTaskLambda,
          actionName: "DeployTempEnv",
        }),
      ],
    });
  }
}
