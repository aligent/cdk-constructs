# Aligent AWS Pipeline stack

## Overview

PipelineStack with Cross-account deployment

This stack configures an AWS CodePipeline application which will deploy an instance of another "child" CDK stack based on any changes to the configured repository/branch.

## Multi AWS Account
Instructions in this readme refer to two AWS accounts, The Pipeline account, which runs the AWS CodePipeline and the Target account where the "child" stack is deployed.

While both stacks (Pipeline and Target) could be the same, and these instructions should work in such a case, we have chosen to separate these for security reasons.

![Diagram](CdkPipelineCrossAccountDeploy.jpeg)

1. Configure a CDK project on your local machine, run `cdk deploy` to create a CodePipeline in the pipeline acconut via CloudFormation.
2. Push the project code to a new git repository/branch
3. CodePipeline Source stage picks up the change in the repository/branch and initiate the pipeline
4. CodePipeline Deploy stage initiates Target Account Cloudformation stack creation/update
5. TargetAccount's CloudFormation creates/configures/updates stack resources


## How to use: Creating a new PipelineStack project

> **_NOTE:_** npm ver.7 will cause an issue a later stage hence ver.6 is required until this issue is resolved: https://github.com/npm/cli/issues/2610

Install cdk first (`npm install -g aws-cdk`, or [this instruction](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html)) and follow the steps described below.


1. In order to have AWS Pipeline Account authorized to talk to the version control system, create *CodeStar Connection*. This is a one-off task between the two, though, hence reusable across multiple projects. [Connecting to BitBucket, for example](https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-create-bitbucket.html)

2. Initialise a CDK project

    $ npx cdk init app --language=typescript

3. Bootstrap the Target Account to grant the Pipeline Account permission to create resources within in. This is per-region basis.

        $ env CDK_NEW_BOOTSTRAP=1 npx cdk bootstrap \
                --profile <TargetAccountProfile> \
                --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess \
                --trust <ToolsAccountId> \
                aws://<TargetAccountId>/<region>

4. Add this module to your project as a dependency

        $ npm install @aligent/aws-cdk-pipeline-stack

5. Create a CDK Typescript file which creates this stack.  
The following CDK snippet can be used to provision a pipeline stack which deploys an empty stack into another AWS account. 
Remember to replace the properties.

```
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { PipelineStack } from '@aligent/aws-cdk-pipeline-stack'
import { Stack, Construct } from '@aws-cdk/core';

const pipelineStackProps = {
     env: {
          region: 'ap-southeast-2',
          account: 'account-id-goes-here',
     },
     pipelineName: 'pipelineName',
     stackName: 'stack-name',
     envName: 'dev',
     owner: 'string',
     repo: 'repo',
     branch: 'branch',
     connectionArn: 'connection',
     manualApprovals: false
}
const app = new cdk.App();

new PipelineStack(app, 'pipeline-stack', pipelineStackProps, (scope: Construct): void => {new Stack(scope, 'blank-stack', stackProps)});

```

Within the anonymous function in:
```
new PipelineStack(app, 'pipeline-stack', pipelineStackProps, (scope: Construct): void => {new Stack(scope, 'blank-stack', stackProps)});
```
The preferred stack type can be constructed.

7. Run `npm install` and update `cdk.json`:

    - `app`: replace `<project_name.ts>` with `pipeline.ts`.
    - `context`: add `"@aws-cdk/core:newStyleStackSynthesis": true`

8. Test by running `npx cdk synth` and `npx cdk ls`. For further testing and customisation, refer to the **Local development** section below. By now you are going to see two stacks per each environment; one for Pipeline deployment, the other for direct deployment. See Step 10 down below.

9. Push the code to the relevant branch

10. Deploy the stack, e.g. `npx cdk deploy <target-environment> --profile <ToolsAccountProfile>` to create the CodePipeline, followed by TargetAccount resource creation. 

## Local development
[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally.
1. Pull this repository locally
2. `cd` into this repository
3. run `npm link`
4. `cd` into the downstream repo (target project, etc) and run `npm link 'aws-pipeline-stack'`
The downstream repository should now include a symlink to this module. Allowing local changes to be tested before pushing.

