import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib/core';
import { SecurityHeaderFunction } from '../lib/index';

/*
 * Example test
 */
test('Lambda Function Created', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {env: {region: 'us-east-1'}});
  // WHEN
  new SecurityHeaderFunction(stack, 'MyTestConstruct');
  // THEN
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::Lambda::Function",1);
});
