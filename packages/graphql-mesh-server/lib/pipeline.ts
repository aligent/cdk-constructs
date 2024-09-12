import { Duration, Stack } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import * as pipe_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Topic } from "aws-cdk-lib/aws-sns";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import {
  DetailType,
  NotificationRule,
} from "aws-cdk-lib/aws-codestarnotifications";

export interface CodePipelineServiceProps {
  /**
   * Repository the code container is pushed too
   */
  repository: Repository;

  /**
   * Services to deploy Code container updates to
   */
  service: FargateService;

  /**
   * Path to buildspec.yml (default: '../assets/buildspec.yml')
   */
  buildspecPath?: string;

  /**
   * ARN of the SNS Topic to send deployment notifications to
   */
  notificationArn?: string;

  /**
   * AWS Region the SNS topic is deployed in
   */
  notificationRegion?: string;

  /**
   * CloudFront distribution ID to clear cache on.
   */
  cloudFrontDistributionId?: string;

  /**
   * Deployment pipeline name
   *
   * @default AWS CloudFormation generates an ID and uses that for the pipeline name
   */
  pipelineName?: string;
}

export class CodePipelineService extends Construct {
  public readonly pipeline: Pipeline;

  constructor(scope: Construct, id: string, props: CodePipelineServiceProps) {
    super(scope, id);

    this.pipeline = new Pipeline(this, "deploy-pipeline", {
      pipelineName:
        props.pipelineName !== undefined ? props.pipelineName : undefined,
    });

    const sourceOutput = new Artifact();
    const sourceAction = new pipe_actions.EcrSourceAction({
      actionName: "ECR",
      repository: props.repository,
      output: sourceOutput,
    });

    this.pipeline.addStage({
      stageName: "Source",
      actions: [sourceAction],
    });

    const file = fs.readFileSync(
      path.resolve(__dirname, props.buildspecPath || "../assets/buildspec.yml"),
      "utf8"
    );
    const project: codebuild.PipelineProject = new codebuild.PipelineProject(
      this,
      "project",
      {
        buildSpec: codebuild.BuildSpec.fromObject(YAML.parse(file)),
      }
    );

    const buildOutput = new Artifact();
    this.pipeline.addStage({
      stageName: "Build",
      actions: [
        new pipe_actions.CodeBuildAction({
          actionName: "CodeBuild",
          project,
          input: sourceOutput,
          outputs: [buildOutput],
          environmentVariables: {
            IMAGE_URI: {
              value: sourceAction.variables.imageUri,
            },
            CONTAINER_NAME: {
              value:
                props.service.taskDefinition.findContainer("mesh")
                  ?.containerName,
            },
          },
        }),
      ],
    });
    this.pipeline.addStage({
      stageName: "Deploy",
      actions: [
        new pipe_actions.EcsDeployAction({
          actionName: "DeployAction",
          service: props.service,
          input: buildOutput,
          deploymentTimeout: Duration.minutes(10),
        }),
      ],
    });

    if (props.cloudFrontDistributionId) {
      const invalidateCacheLambda = new NodejsFunction(
        this,
        "InvalidateCacheLambda",
        {
          entry: path.resolve(
            __dirname,
            "../assets/handlers/invalidate-cloudfront-cache.ts"
          ),
          description: "Lambda function to invalidate CloudFront cache.",
          runtime: Runtime.NODEJS_18_X,
          handler: "index.handler",
          timeout: Duration.seconds(5),
          environment: {
            PATHS: "/graphql",
            DISTRIBUTION_ID: props.cloudFrontDistributionId,
          },
        }
      );

      invalidateCacheLambda.addToRolePolicy(
        new PolicyStatement({
          actions: ["cloudfront:CreateInvalidation"],
          resources: [
            `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${
              props.cloudFrontDistributionId
            }`,
          ],
          effect: Effect.ALLOW,
        })
      );

      this.pipeline.addStage({
        stageName: "InvalidateCloudFrontCache",
        actions: [
          new pipe_actions.LambdaInvokeAction({
            actionName: "InvalidateCloudFrontCache",
            lambda: invalidateCacheLambda,
          }),
        ],
      });
    }

    if (props.notificationArn) {
      const notifier = new NodejsFunction(this, "NotifierLambda", {
        entry: path.resolve(__dirname, "../assets/handlers/notify-sns.ts"),
        description:
          "Lambda function to forward SNS messages to another account.",
        runtime: Runtime.NODEJS_18_X,
        handler: "index.handler",
        timeout: Duration.seconds(10),
        environment: {
          SNS_TOPIC: props.notificationArn,
          REGION: props.notificationRegion || Stack.of(this).region,
        },
      });

      notifier.addToRolePolicy(
        new PolicyStatement({
          actions: ["sns:publish"],
          resources: [props.notificationArn],
          effect: Effect.ALLOW,
        })
      );

      const topic = new Topic(this, "NotifierTopic");
      topic.addSubscription(new LambdaSubscription(notifier));

      new NotificationRule(this, "CodeStarNotificationRule", {
        detailType: DetailType.FULL,
        events: [
          "codepipeline-pipeline-pipeline-execution-failed",
          "codepipeline-pipeline-pipeline-execution-canceled",
          "codepipeline-pipeline-pipeline-execution-started",
          "codepipeline-pipeline-pipeline-execution-resumed",
          "codepipeline-pipeline-pipeline-execution-succeeded",
          "codepipeline-pipeline-pipeline-execution-superseded",
        ],
        targets: [topic],
        source: this.pipeline,
      });
    }
  }
}
