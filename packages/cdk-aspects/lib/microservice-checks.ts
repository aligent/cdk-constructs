import { CfnResource } from "aws-cdk-lib";
import { CfnStage } from "aws-cdk-lib/aws-apigateway";
import {
  NagMessageLevel,
  NagPack,
  NagRuleCompliance,
  NagRuleResult,
  NagRules,
  rules,
  type NagPackProps,
} from "cdk-nag";
import type { IConstruct } from "constructs";
import { isCdkManagedSingleton } from "./cdk-managed-singletons";

type RuleResult = (node: CfnResource) => NagRuleResult;

/**
 * Checks that an API Gateway stage name matches the expected value.
 */
function apiGatewayStageName(expected: string): RuleResult {
  return (node: CfnResource) => {
    if (node instanceof CfnStage) {
      const stageName = NagRules.resolveIfPrimitive(node, node.stageName);
      if (stageName !== expected) {
        return NagRuleCompliance.NON_COMPLIANT;
      }
      return NagRuleCompliance.COMPLIANT;
    }
    return NagRuleCompliance.NOT_APPLICABLE;
  };
}

export interface MicroserviceChecksProps extends NagPackProps {
  /**
   * The expected API Gateway stage name.
   * Must be exactly 3 lowercase alphanumeric characters (e.g. dev, stg, prd).
   */
  readonly stageName: string;
}

/**
 * Microservice Checks are a compilation of rules to validate infrastructure-as-code template
 * against recommended practices using the cdk-nag library.
 *
 * @see https://github.com/cdk-patterns/cdk-nag/
 *
 * @example
 * const app = new App();
 * const stack = new Stack(app, 'MyStack');
 * Aspects.of(stack).add(new MicroservicesChecks({ stageName: 'prd' }));
 */
export class MicroserviceChecks extends NagPack {
  private readonly stageName: string;

  constructor(props: MicroserviceChecksProps) {
    super(props);
    this.packName = "Microservices";

    if (!/^[a-z0-9]{3}$/.test(props.stageName)) {
      throw new Error(
        `stageName must be exactly 3 lowercase alphanumeric characters, got: "${props.stageName}"`
      );
    }
    this.stageName = props.stageName;
  }

  public visit(node: IConstruct) {
    if (isCdkManagedSingleton(node)) return;

    if (node instanceof CfnResource) {
      this.applyRule({
        info: "The Lambda function does not have an explicit memory value configured.",
        explanation:
          "Lambda allocates CPU power in proportion to the amount of memory configured. By default, your functions have 128 MB of memory allocated. You can increase that value up to 10 GB. With more CPU resources, your Lambda function's duration might decrease.  You can use tools such as AWS Lambda Power Tuning to test your function at different memory settings to find the one that matches your cost and performance requirements the best.",
        level: NagMessageLevel.ERROR,
        rule: rules.lambda.LambdaDefaultMemorySize,
        node: node,
      });
      this.applyRule({
        info: "The Lambda function does not have an explicitly defined timeout value.",
        explanation:
          "Lambda functions have a default timeout of 3 seconds. If your timeout value is too short, Lambda might terminate invocations prematurely. On the other side, setting the timeout much higher than the average execution may cause functions to execute for longer upon code malfunction, resulting in higher costs and possibly reaching concurrency limits depending on how such functions are invoked. You can also use AWS Lambda Power Tuning to test your function at different timeout settings to find the one that matches your cost and performance requirements the best.",
        level: NagMessageLevel.ERROR,
        rule: rules.lambda.LambdaDefaultTimeout,
        node: node,
      });
      this.applyRule({
        info: "The Lambda function does not have tracing set to Tracing.ACTIVE.",
        explanation:
          "When a Lambda function has ACTIVE tracing, Lambda automatically samples invocation requests, based on the sampling algorithm specified by X-Ray.",
        level: NagMessageLevel.ERROR,
        rule: rules.lambda.LambdaTracing,
        node: node,
      });
      this.applyRule({
        info: "The CloudWatch Log Group does not have an explicit retention policy defined.",
        explanation:
          "By default, logs are kept indefinitely and never expire. You can adjust the retention policy for each log group, keeping the indefinite retention, or choosing a retention period between one day and 10 years. For Lambda functions, this applies to their automatically created CloudWatch Log Groups.",
        level: NagMessageLevel.ERROR,
        rule: rules.cloudwatch.CloudWatchLogGroupRetentionPeriod,
        node: node,
      });
      this.applyRule({
        info: "The API Gateway stage does not have a valid stageName configured.",
        explanation: `The API Gateway stage name must be exactly 3 lowercase alphanumeric characters and match the expected value "${this.stageName}". This ensures consistent naming conventions across environments (e.g. dev, stg, prd).`,
        level: NagMessageLevel.ERROR,
        rule: apiGatewayStageName(this.stageName),
        node: node,
      });
    }
  }
}
