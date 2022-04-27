#!/usr/bin/env node
import 'source-map-support/register';
import {  Stack, StackProps, App, Duration, aws_cloudwatch, aws_cloudwatch_actions, 
          aws_rds, aws_ec2, aws_sns, aws_sns_subscriptions, aws_lambda, aws_lambda_nodejs, aws_ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
// import { Subscription } from 'aws-cdk-lib/aws-sns';

const RDSINSTANCES = process.env.RDSINSTANCES as string;
const SECURITYGROUP = process.env.SECURITYGROUP as string;
const CDK_DEFAULT_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT
const CDK_DEFAULT_REGION = process.env.CDK_DEFAULT_REGION
const WEBHOOK_URL_PARAMETER = process.env.WEBHOOK_URL_PARAMETER as string;
const ALERT_USERNAME = process.env.ALERT_USERNAME as string;
const ALERT_CHANNEL = process.env.ALERT_CHANNEL as string;

if (typeof RDSINSTANCES === 'string'){
  var instances = RDSINSTANCES.split(',');
}

export class CloudwatchRDSAlertStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const topic = new aws_sns.Topic(this, 'SNS');

    for ( var i in instances) {
      const db = aws_rds.DatabaseInstance.fromDatabaseInstanceAttributes(this, instances[i], {
        instanceEndpointAddress: 'garbage value', // Can be an arbitrary value
        instanceIdentifier: instances[i], // CloudWatch looks out for this value
        port: 3306, // Can be an arbitrary value
        securityGroups: [aws_ec2.SecurityGroup.fromLookupById(this, instances[i]+'-sg', `${SECURITYGROUP}`)] // SG ID has to be valid
      });
      // Only "Average over 5 minutes" is available, hence one evaluation only before firing the alarm off:
      // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.DatabaseInstance.html#metricwbrcpuutilizationprops
      const alarm_cpu = new aws_cloudwatch.Alarm(this, instances[i]+'-alarm', {
        alarmName: instances[i]+' database CPU usage alert', // Notification title if sent to Slack
        evaluationPeriods: 1, // The number of periods over which data is compared to the specified threshold. ( 5 minute )
        datapointsToAlarm: 1, // The number of datapoints that must be breaching to trigger the alarm.
        threshold: 30, // over x %
        metric: db.metricCPUUtilization(),
        treatMissingData: aws_cloudwatch.TreatMissingData.BREACHING
      });
      alarm_cpu.addAlarmAction(new aws_cloudwatch_actions.SnsAction(topic));
      alarm_cpu.addOkAction(new aws_cloudwatch_actions.SnsAction(topic));
    };

    const notifySlack = new aws_lambda_nodejs.NodejsFunction(this, 'notifySlack', {
      memorySize: 1024,
      timeout: Duration.seconds(5),
      runtime: aws_lambda.Runtime.NODEJS_14_X,
      handler: 'handler',
      entry: path.join(__dirname, `/../handlers/notifySlack.ts`),
      environment: {
        WEBHOOK_URL_PARAMETER: WEBHOOK_URL_PARAMETER,
        ALERT_USERNAME: ALERT_USERNAME,
        ALERT_CHANNEL: ALERT_CHANNEL
      }
    });

    const param = aws_ssm.StringParameter.fromSecureStringParameterAttributes(this, 'webhookurl', {
      parameterName: WEBHOOK_URL_PARAMETER,
      version: 1
    });
    param.grantRead(notifySlack);

    topic.addSubscription(new aws_sns_subscriptions.LambdaSubscription(notifySlack));
  }
}

const app = new App();
new CloudwatchRDSAlertStack(app, 'CloudwatchRDSAlertStack', {
  env: {
    account: `${CDK_DEFAULT_ACCOUNT}`,
    region: `${CDK_DEFAULT_REGION}`
}
});