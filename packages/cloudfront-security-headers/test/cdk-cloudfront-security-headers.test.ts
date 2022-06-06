import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { SecurityHeaderFunction } from '../lib/index';

/*
 *  Test the lambda function was created
 */
test('Lambda Function Created', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {env: {region: 'us-east-1'}});
  new SecurityHeaderFunction(stack, 'MyTestConstruct');
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::Lambda::Function",1);
});
