#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';
import {
   ManagedPolicy,
   Role,
   ServicePrincipal,
   CompositePrincipal,
   PolicyStatement,
   Effect,
   Group,
   User
} from '@aws-cdk/aws-iam';

const SERVICE_NAME = process.env.SERVICE_NAME ? process.env.SERVICE_NAME : ''
const SHARED_VPC_ID = process.env.SHARED_VPC_ID
const STACK_SUFFIX = '-deploy-iam'
const EXPORT_PREFIX = process.env.EXPORT_PREFIX ? process.env.EXPORT_PREFIX : SERVICE_NAME
class ServiceDeployIAM extends cdk.Stack {

     constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
          super(scope, id, props);

          // Version will be used for auditing which role is being used by projects.
          // This should only be updated for BREAKING changes.
          const version = '1'
          const serviceName = cdk.Stack.of(this).stackName.replace(STACK_SUFFIX,'');
          const accountId = cdk.Stack.of(this).account;
          const region = cdk.Stack.of(this).region

          const cloudFormationResources = ServiceDeployIAM.formatResourceQualifier('CLOUD_FORMATION', `arn:aws:cloudformation:${region}:${accountId}:stack`, [`${serviceName}*`]);
          const s3BucketResources = ServiceDeployIAM.formatResourceQualifier('S3', `arn:aws:s3:::`, [`${serviceName}*`, `${serviceName}*/*`], "");
          const cloudWatchResources = ServiceDeployIAM.formatResourceQualifier('CLOUD_WATCH', `arn:aws:logs:${region}:${accountId}:log-group:`, [`aws/lambda/${serviceName}*`]);
          const lambdaResources = ServiceDeployIAM.formatResourceQualifier('LAMBDA', `arn:aws:lambda:${region}:${accountId}:function:`, [`${serviceName}*`], '');
          const stepFunctionResources = ServiceDeployIAM.formatResourceQualifier('STEP_FUNCTION', `arn:aws:states:${region}:${accountId}:stateMachine:`, [`${serviceName}*`], "");
          const dynamoDbResources = ServiceDeployIAM.formatResourceQualifier('DYNAMO_DB', `arn:aws:dynamodb:${region}:${accountId}:table`, [`${serviceName}*`]);
          const iamResources = ServiceDeployIAM.formatResourceQualifier('IAM', `arn:aws:iam::${accountId}:role`, [`${serviceName}*`]);
          const eventBridgeResources = ServiceDeployIAM.formatResourceQualifier('EVENT_BRIDGE', `arn:aws:events:${region}:${accountId}`, [`rule/${serviceName}*`, `event-bus/${serviceName}*`], ":");
          const apiGatewayResources = ServiceDeployIAM.formatResourceQualifier('API_GATEWAY', `arn:aws:apigateway:${region}::`, [`*`]);
          const ssmDeploymentResources = ServiceDeployIAM.formatResourceQualifier('SSM', `arn:aws:ssm:${region}:${accountId}:parameter`, [`${serviceName}*`]);
          const snsResources = ServiceDeployIAM.formatResourceQualifier('SNS', `arn:aws:sns:${region}:${accountId}:`, [`${serviceName}*`]);

          const serviceRole = new Role(this, `ServiceRole-v${version}`, {
               assumedBy: new CompositePrincipal(
                    new ServicePrincipal('cloudformation.amazonaws.com'),
                    new ServicePrincipal('lambda.amazonaws.com')
               )
          });

          // S3 bucket policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: s3BucketResources,
                    actions: [
                         "s3:*"
                    ]
               })
          );
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "s3:ListAllMyBuckets",
                    ]
               })
          );


          if (SHARED_VPC_ID) {
               // Secutiry Groups
               serviceRole.addToPolicy(
                    new PolicyStatement({
                         effect: Effect.ALLOW,
                         resources: ['*'],
                         actions: [
                              "ec2:CreateSecurityGroup",
                              "ec2:DescribeSecurityGroups",
                              "ec2:DescribeSubnets",
                              "ec2:DescribeVpcs",
                              "ec2:createTags"
                         ]
                    })
               );
               serviceRole.addToPolicy(
                    new PolicyStatement({
                         effect: Effect.ALLOW,
                         resources: ['*'],
                         conditions: {
                              "StringEquals": {
                                   "ec2:Vpc": `arn:aws:ec2:${region}:${accountId}vpc:/${SHARED_VPC_ID}`
                              }
                         },
                         actions: [
                              "ec2:DeleteSecurityGroup",
                         ]
                    })
               );
          }


          // CloudWatch policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: cloudWatchResources,
                    actions: [
                         "logs:CreateLogGroup",
                         "logs:DescribeLogGroup",
                         "logs:DeleteLogGroup",
                         "logs:CreateLogStream",
                         "logs:DescribeLogStreams",
                         "logs:DeleteLogStream",
                         "logs:FilterLogEvents"
                    ]
               })
          );


          // Lambda policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: lambdaResources,
                    actions: [
                         "lambda:GetFunction",
                         "lambda:CreateFunction",
                         "lambda:DeleteFunction",
                         "lambda:UpdateFunctionConfiguration",
                         "lambda:UpdateFunctionCode",
                         "lambda:ListVersionsByFunction",
                         "lambda:PublishVersion",
                         "lambda:CreateAlias",
                         "lambda:DeleteAlias",
                         "lambda:UpdateAlias",
                         "lambda:GetFunctionConfiguration",
                         "lambda:AddPermission",
                         "lambda:RemovePermission",
                         "lambda:InvokeFunction"
                    ]
               })
          );


          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "lambda:GetEventSourceMapping",
                         "lambda:ListEventSourceMappings"
                    ]
               })
          );


          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    conditions: {
                         "StringLike": {
                              "lambda:FunctionArn": lambdaResources[0]
                         }
                    },
                    resources: ['*'],
                    actions: [
                         "lambda:DeleteEventSourceMapping",
                         "lambda:UpdateEventSourceMapping",
                         "lambda:CreateEventSourceMapping",
                    ]
               })
          );


          // IAM policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: iamResources,
                    actions: [
                         "iam:PassRole",
                         "iam:CreateRole",
                         "iam:GetRole",
                         "iam:DeleteRole",
                         "iam:GetRolePolicy",
                         "iam:DeleteRolePolicy",
                         "iam:PutRolePolicy",
                         "iam:DetachRolePolicy",
                         "iam:AttachRolePolicy",
                    ]
               })
          );

          // DynamoDB policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: dynamoDbResources,
                    actions: [
                         "dynamodb:DescribeTable",
                         "dynamodb:CreateTable",
                         "dynamodb:UpdateTable",
                         "dynamodb:DeleteTable",
                    ]
               })
          );

          // StepFunctions policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: stepFunctionResources,
                    actions: [
                         "states:CreateStateMachine",
                         "states:UpdateStateMachine",
                         "states:DeleteStateMachine",
                         "states:DescribeStateMachine",
                         "states:TagResource",
                    ]
               })
          );

          // EventBridge policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: eventBridgeResources,
                    actions: [
                         "events:EnableRule",
                         "events:PutRule",
                         "events:DescribeRule",
                         "events:ListRules",
                         "events:DisableRule",
                         "events:PutTargets",
                         "events:RemoveTargets",
                         "events:DeleteRule",
                         "events:CreateEventBus"
                    ]
               })
          );

          // APIGateway policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: apiGatewayResources,
                    actions: [
                         "apigateway:*",
                    ]
               })
          );


          // SNS policy
          serviceRole.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: snsResources,
                    actions: [
                         "sns:GetTopicAttributes",
                         "sns:CreateTopic",
                         "sns:DeleteTopic",
                         "sns:Subscribe",
                    ]
               })
          );

          const deployUser = new User(this, 'DeployUser', {
               userName: `${serviceName}-deployer`,
          })

          const deployGroup = new Group(this, `${serviceName}-deployers`);

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "cloudformation:ValidateTemplate",
                    ]
               })
          );

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: cloudFormationResources,
                    actions: [
                         "cloudformation:CreateStack",
                         "cloudformation:DescribeStacks",
                         "cloudformation:DeleteStack",
                         "cloudformation:DescribeStackEvents",
                         "cloudformation:UpdateStack",
                         "cloudformation:ExecuteChangeSet",
                         "cloudformation:CreateChangeSet",
                         "cloudformation:DeleteChangeSet",
                         "cloudformation:DescribeChangeSet",
                         "cloudformation:ListStackResources",
                         "cloudformation:DescribeStackResource",
                         "cloudformation:DescribeStackResources",
                         "cloudformation:GetTemplate"
                    ]
               })
          );

          // Serverless uses this to skip functions which have not changed
          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: lambdaResources,
                    actions: [
                         "lambda:GetFunction",
                    ]
               })
          );

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: [serviceRole.roleArn],
                    actions: [
                         "iam:PassRole"
                    ]
               })
          );

          // S3 bucket policy
          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: s3BucketResources,
                    actions: [
                         "s3:ListBucket",
                         "s3:DeleteObject",
                         "s3:PutObject",
                         "s3:GetObject",
                         "s3:GetBucketLocation"
                    ]
               })
          );
          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "s3:ListAllMyBuckets",
                    ]
               })
          );


          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "ssm:DescribeParameters",
                    ]
               })
          );

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ssmDeploymentResources,
                    actions: [
                         "ssm:GetParameter",
                    ]
               })
          );

          // Deploy user must have permission to fetch API keys after the deploy
          // Generated api key names are random so this cannot be limited to the service at this time
          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: [`arn:aws:apigateway:${region}::/apikeys/*`],
                    actions: [
                         "apigateway:GET",
                    ]
               })
          );


          deployUser.addToGroup(deployGroup);

          // Export CDK Output
          const export_prefix = !EXPORT_PREFIX.endsWith('-') ? EXPORT_PREFIX.concat("-") : EXPORT_PREFIX

          new cdk.CfnOutput(this, `${export_prefix}DeployUserName`, {
               description: 'PublisherUser',
               value: deployUser.userName,
               exportName: `${export_prefix}serverless-deployer-username`,
          });

          new cdk.CfnOutput(this, `${export_prefix}DeployRoleArn`, {
               value: serviceRole.roleArn,
               description: 'The ARN of the CloudFormation service role',
               exportName: `${export_prefix}serverless-deployer-role-arn`,
          });

          new cdk.CfnOutput(this, `${export_prefix}Version`, {
               value: version,
               description: 'The version of the resources that are currently provisioned in this stack',
               exportName: `${export_prefix}cdk-stack-version`,
          });

          const parameterName = `/serverless-deploy-iam/${serviceName}/version`;

          new ssm.StringParameter(this, 'ServerlessDeployIAMVersion', {
               parameterName: parameterName,
               description: 'The version of the serverless-deploy-iam resources',
               stringValue: version
          });
     }

     // Takes an array of qualifiers and prepends the prefix to each, returning the resulting array
     // Tests for injected resource qualifiers and adds these.
     static formatResourceQualifier(serviceName: string, prefix: string, qualifiers: string[], delimiter: string = "/"): string[] {
          return [
               ...qualifiers,
               ...process.env[`${serviceName}_QUALIFIER`]?.split(",") || []
               ].filter(Boolean).map((qualifier) => { return `${prefix}${delimiter}${qualifier}` })
     }


}

const app = new cdk.App();
new ServiceDeployIAM(app, `${SERVICE_NAME}${STACK_SUFFIX}`, { description: "This stack includes IAM resources needed to deploy Serverless apps into this environment"});
