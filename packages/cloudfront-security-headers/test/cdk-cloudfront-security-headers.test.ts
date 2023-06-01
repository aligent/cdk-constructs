import { expect as expectCDK, countResources } from "@aws-cdk/assert";
import * as cdk from "@aws-cdk/core";
import { SecurityHeaderFunction } from "../lib/index";

/*
 * Example test
 */
test("Lambda Function Created", () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { region: "us-east-1" },
  });
  // WHEN
  new SecurityHeaderFunction(stack, "MyTestConstruct");
  // THEN
  expectCDK(stack).to(countResources("AWS::Lambda::Function", 1));
});
