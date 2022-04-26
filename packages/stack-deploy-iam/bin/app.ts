#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';
import { 
   PolicyStatement, 
   Effect,
   Group,
   User
} from '@aws-cdk/aws-iam';

const STACK_NAME = process.env.STACK_NAME
const STACK_SUFFIX = '-deploy-iam'

class StackDeployUser extends cdk.Stack {

     constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
          super(scope, id, props);

          // Version will be used for auditing which role is being used by projects.
          // This should only be updated for BREAKING changes.
          const version = '1'
          const accountId = cdk.Stack.of(this).account;
          const stackName = cdk.Stack.of(this).stackName.replace(STACK_SUFFIX,'');


          const bootstrapCfnIamRole = [`arn:aws:iam::${accountId}:role/cdk-cfn-exec-role-${accountId}-*`]
          const bootstrapIamRoles = [`arn:aws:iam::${accountId}:role/cdk-*-role-${accountId}-*`]

          const deployUser = new User(this, 'DeployUser', {
               userName: `${stackName}-deployer`,
          })

          const deployGroup = new Group(this, `${stackName}-deployers`);

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: bootstrapCfnIamRole,
                    actions: [
                         "iam:PassRole"
                    ]
               })
          );

          deployGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: bootstrapIamRoles,
                    actions: [
                         "sts:AssumeRole"
                    ]
               })
          );

          deployUser.addToGroup(deployGroup);

          new cdk.CfnOutput(this, 'DeployUserName', {
               description: 'PublisherUser',
               value: deployUser.userName,
          });

          new cdk.CfnOutput(this, 'Version', {
               value: version,
               description: 'The version of the resources that are currently provisioned in this stack',
          });

          const parameterName = `/stack-deploy-user/${stackName}/version`;

          new ssm.StringParameter(this, 'StackDeployIAMVersion', {
               parameterName: parameterName,
               description: 'The version of the stack-deploy-user resources',
               stringValue: version
          });
     }

}

const app = new cdk.App();
new StackDeployUser(app, `${STACK_NAME}${STACK_SUFFIX}`, { description: `This stack provisions an IAM user needed to deploy the ${STACK_NAME} CDK stack into this environment`});
