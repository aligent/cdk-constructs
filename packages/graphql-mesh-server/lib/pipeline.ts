import { Duration } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import * as pipe_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";

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
}

export class CodePipelineService extends Construct {
  public readonly pipeline: Pipeline;

  constructor(scope: Construct, id: string, props: CodePipelineServiceProps) {
    super(scope, id);

    this.pipeline = new Pipeline(this, "deploy-pipeline");

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
                props.service.taskDefinition.defaultContainer?.containerName,
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
  }
}
