# EventBridge IAM stack

## Introduction
This repository contains a stack which can be deployed into an AWS account to provide an IAM user for submitting events to [AWS EventBridge](https://aws.amazon.com/eventbridge/). 

This stack will provision a CloudFormation IAM user with permission to deploy to the default EventBridge bus with the provided source.


## Usage
This repository does not need to be forked, copied or imported. The intention is for it to be deployed *AS IS* into each environment for each service.

This tool is philosophically similar to the [AWS CDK Bootstrap](https://github.com/aws/aws-cdk/blob/master/design/cdk-bootstrap.md) but specific to Aligent services IAM resources.

### Parameters 
The CDK stack requires the event source to be provided as an environment variable.

### Deploying:
The intention is that this stack is deployed manually using the CDK CLI by an IAM user with admin privileges. 
This should then be the last deployment into the environment from outside automated pipelines.

Use the following command to deploy this into an environment:

```
EVENT_SOURCE=<SOURCE> npx cdk deploy --profile <AWS_PROFILE>
```

### Next Steps
Once this finishes a user will be created (ARN in stack output). This user will have the appropriate permissions to submit to EventBridge.
