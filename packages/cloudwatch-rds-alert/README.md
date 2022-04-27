# Create CloudWatch Alerts for RDS Instance CPU Usage

## Introduction
This stack creates CloudWatch alerts for a given RDS instances and configure Slack notification for them, incorporating CDKv2.0.

## Usage
You just need `AWS profiles` properly configured and `docker` installed to use this; you don't need `CDK`, `Node` or other tools. 
This ensures all the commands are run inside the docker container so that you don't need to fork/clone the repo or to deal with version compatibilities, etc.

Before moving on, make sure the below have been completed:

- Bootstrap your environment with CDKv2.x (https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
- Create Slack Channel and Incoming Webhook URL (https://api.slack.com/messaging/webhooks)
- Save the Webhook URL in SSM Parameter store (https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-su-create.html)
 
### Interactive Mode:
Just run this command for an interactive deployment:

`docker run --rm -it --volume ~/.aws:/home/node/.aws aligent/cdk-cloudwatch-rds-alert`

It will ask a few parameters including:

- RDS Instances: **comma-separated** list of RDS instance identifiers
- SSM Parameter: the SSM parameter name where the Webhook URL is stored
- Slack Alert User Name and Channel

### Headless Mode
You can run a one-liner by specifying all the arguments required:

`docker run --rm -it --volume ~/.aws:/home/node/.aws aligent/cdk-cloudwatch-rds-alert --profile <AWS_PROFILE> --rds-instances <RDS_INSTANCE_ID> --security-group <SECURITY_GROUP> --slack-webhook-url-ssm <AWS_SSM_PARAMETER_FOR_SLACK_WEBHOOK_URL> --slack-channel <SLACK_CHANNEL> [--slack-username <SLACK_USERNAME>]`

*Note: if you run the command once again against the same account with different parameters, the existing stack will be overwritten.*

## Limitations
The only available RDS CPU metric in CDK is "Average 5 over minutes". Therefore the alerts fire off with one violation.
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstance.html#metricwbrcpuutilizationprops

## Future updates
- Optional: DB alias and alert threshold
- Additional monitoring metrics, e.g. per cent of max_connections