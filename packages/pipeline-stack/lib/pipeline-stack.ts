import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import { Construct, Stack, StackProps, StageProps, Stage, } from '@aws-cdk/core';
import { CdkPipeline, SimpleSynthAction } from "@aws-cdk/pipelines";

// StackConstructor function used to construct a Stack with context only available from the calling
// function but associated with the Pipeline Stage's scope.
type StackConstructor = ((scope: Construct) => void);

// Define Stage details
class PipelineStage extends Stage {
    constructor(scope: Construct, id: string, props: PipelineProps, stackConstructor: StackConstructor) {
        super(scope, id, props);
        stackConstructor(this);
    }
}

// Parameters for Pipeline that runs the Stage
interface PipelineProps extends StackProps {
    owner: string;
    repo: string;
    branch: string;
    connectionArn: string;
    manualApprovals: boolean;
    pipelineName: string;
}

// Define Pipeline details
export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: PipelineProps, stackConstructor: StackConstructor) {
        super(scope, id, props);

        const sourceArtifact = new codepipeline.Artifact();
        const cloudAssemblyArtifact = new codepipeline.Artifact();

        const pipeline = new CdkPipeline(this, id + '-pipeline', {
            pipelineName: props.pipelineName,
            cloudAssemblyArtifact,
            sourceAction: new codepipeline_actions.BitBucketSourceAction({
                actionName: 'BitBucket',
                output: sourceArtifact,
                owner: props.owner,
                repo: props.repo,
                branch: props.branch,
                connectionArn: props.connectionArn,
                codeBuildCloneOutput: true
            }),
            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact,
                cloudAssemblyArtifact,
                synthCommand: 'npx cdk synth ' + id
            }),
        });

        pipeline.addApplicationStage(new PipelineStage(this, 'pipeline-stage', props, stackConstructor), { manualApprovals: props.manualApprovals })

    }
}
