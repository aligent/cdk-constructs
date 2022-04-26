# CDK Stack deploy IAM

## Introduction
This stack will provision an IAM user with permission to assume (pass in the case of cfn-execute) the account's [CDK Bootstrap](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html) roles. This user can then be used in deployment pipelines.

CD pipelines can then be setup with this user.


## Usage
This repository does not need to be forked, copied or imported. The intention is for it to be deployed *AS IS* into each environment for each service.
Additional permissions should be added to this stack and feature flagged rather than being added ad hoc to the environment.

### Parameters
The CDK stack requires the stack name to be provided as an environment variable.
This is the name of the CloudFormation stack which will be deployed.

### Deploying:
The intention is that this stack is deployed manually using the CDK CLI by an IAM user with admin privileges.
This should then be the last deployment into the environment from outside automated pipelines.

The actual CloudFormation stack can then be created and completely managed by the CD user via pipelines.

Use the following command to deploy this into an environment:

```
AWS_REGION=<AWS_REGION> STACK_NAME=<STACK_NAME> npx cdk deploy --profile <AWS_PROFILE>
```
