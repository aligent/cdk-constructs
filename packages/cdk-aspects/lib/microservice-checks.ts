import { Annotations, CfnResource, Stack, TagManager } from "aws-cdk-lib";
import { CfnRestApi, CfnStage } from "aws-cdk-lib/aws-apigateway";
import { CfnApi } from "aws-cdk-lib/aws-apigatewayv2";
import { CfnTable } from "aws-cdk-lib/aws-dynamodb";
import { CfnRule } from "aws-cdk-lib/aws-events";
import { CfnKey } from "aws-cdk-lib/aws-kms";
import { CfnFunction } from "aws-cdk-lib/aws-lambda";
import { CfnPipe } from "aws-cdk-lib/aws-pipes";
import { CfnBucket } from "aws-cdk-lib/aws-s3";
import { CfnSchedule } from "aws-cdk-lib/aws-scheduler";
import { CfnSecret } from "aws-cdk-lib/aws-secretsmanager";
import { CfnTopic } from "aws-cdk-lib/aws-sns";
import { CfnQueue } from "aws-cdk-lib/aws-sqs";
import { CfnParameter as SsmCfnParameter } from "aws-cdk-lib/aws-ssm";
import { CfnStateMachine } from "aws-cdk-lib/aws-stepfunctions";
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

/**
 * Tag accepted as the description for resource types that have no native `Description` property.
 */
const DESCRIPTION_TAG_KEY = "Description";

/**
 * Outcome of reading one description source. `unresolvable` passes because
 * intrinsics (e.g. `Fn::Sub`) can't be checked at synth time.
 */
type DescriptionStatus = "present" | "absent" | "unresolvable";

/**
 * Reads every description source of a resource, or returns undefined when its type isn't covered.
 */
type DescriptionCheck = (node: CfnResource) => DescriptionStatus[] | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves with `Stack.resolve` rather than `NagRules.resolveIfPrimitive`, which throws on
 * intrinsics and makes cdk-nag report a validation failure instead of a finding.
 */
function classify(node: CfnResource, value: unknown): DescriptionStatus {
  const resolved: unknown = Stack.of(node).resolve(value);
  if (resolved === undefined || resolved === null) return "absent";
  if (typeof resolved === "string") {
    return resolved.trim() ? "present" : "absent";
  }
  return "unresolvable";
}

function nativeDescription(
  node: CfnResource & { readonly description?: string }
): DescriptionStatus {
  return classify(node, node.description);
}

/**
 * Only sees tags applied before this pack visits the node, which is why the README
 * recommends adding `MicroserviceChecks` with `AspectPriority.READONLY`.
 */
function descriptionTag(node: CfnResource): DescriptionStatus {
  return classify(node, TagManager.of(node)?.tagValues()[DESCRIPTION_TAG_KEY]);
}

/**
 * Rebuilds ASL JSON from a resolved `DefinitionString`. Token parts (ARNs, Refs) sit inside
 * JSON string values, so dropping them keeps the JSON parseable. A token outside a string
 * makes parsing fail, and the definition is then treated as unresolvable.
 */
function flattenJoin(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;

  const join: unknown = value["Fn::Join"];
  if (!Array.isArray(join) || join.length !== 2) return undefined;

  const [separator, parts]: unknown[] = join;
  if (typeof separator !== "string" || !Array.isArray(parts)) return undefined;

  return parts
    .map((part: unknown) => (typeof part === "string" ? part : ""))
    .join(separator);
}

/**
 * Reads the top-level ASL `Comment` only. States carry their own `Comment`s, which
 * describe a step rather than the state machine, so a regex match would be wrong.
 * File-based definitions (`definitionS3Location`) have no Comment at synth time.
 */
function aslComment(node: CfnStateMachine): DescriptionStatus {
  const stack = Stack.of(node);
  let definition: unknown;

  const definitionString: unknown = stack.resolve(node.definitionString);
  if (definitionString !== undefined) {
    const json = flattenJoin(definitionString);
    if (json === undefined) return "unresolvable";
    try {
      definition = JSON.parse(json);
    } catch {
      return "unresolvable";
    }
  } else {
    definition = stack.resolve(node.definition);
  }

  if (definition === undefined) return "absent";
  if (!isRecord(definition)) return "unresolvable";
  return classify(node, definition.Comment);
}

/**
 * Binds sources to an L1 class so each source receives a correctly typed node.
 */
function describedBy<T extends CfnResource>(
  type: abstract new (...args: never[]) => T,
  ...sources: Array<(node: T) => DescriptionStatus>
): DescriptionCheck {
  return node =>
    node instanceof type ? sources.map(source => source(node)) : undefined;
}

/**
 * Curated rather than "every type with a description" so CDK-generated helpers (e.g. a
 * Lambda's auto-created IAM role) aren't flagged. Types with a native property must use
 * it; tags are only accepted where CloudFormation offers no description property.
 */
const DESCRIPTION_CHECKS: DescriptionCheck[] = [
  describedBy(CfnFunction, nativeDescription),
  describedBy(CfnRestApi, nativeDescription),
  describedBy(CfnApi, nativeDescription),
  describedBy(CfnRule, nativeDescription),
  describedBy(CfnSchedule, nativeDescription),
  describedBy(CfnPipe, nativeDescription),
  describedBy(SsmCfnParameter, nativeDescription),
  describedBy(CfnSecret, nativeDescription),
  describedBy(CfnKey, nativeDescription),
  describedBy(CfnBucket, descriptionTag),
  describedBy(CfnTable, descriptionTag),
  describedBy(CfnQueue, descriptionTag),
  describedBy(CfnTopic, descriptionTag),
  describedBy(CfnStateMachine, aslComment),
];

/**
 * Checks that a covered resource has a non-blank description from any of its accepted sources.
 */
function resourceDescription(node: CfnResource): NagRuleResult {
  for (const check of DESCRIPTION_CHECKS) {
    const statuses = check(node);
    if (statuses) {
      return statuses.some(status => status !== "absent")
        ? NagRuleCompliance.COMPLIANT
        : NagRuleCompliance.NON_COMPLIANT;
    }
  }
  return NagRuleCompliance.NOT_APPLICABLE;
}

/**
 * Mirrors cdk-nag's stack-level suppressions so `NagSuppressions.addStackSuppressions` works
 * for the stack check, which can't use `applyRule` because a Stack isn't a CfnResource.
 */
function isStackSuppressed(stack: Stack, ruleId: string): boolean {
  const cdkNag: unknown = stack.templateOptions.metadata?.cdk_nag;
  if (!isRecord(cdkNag)) return false;

  const suppressions: unknown = cdkNag.rules_to_suppress;
  if (!Array.isArray(suppressions)) return false;

  return suppressions.some(
    (suppression: unknown) => isRecord(suppression) && suppression.id === ruleId
  );
}

export interface MicroserviceChecksProps extends NagPackProps {
  /**
   * The expected API Gateway stage name.
   * Must be exactly 3 lowercase alphanumeric characters (e.g. dev, stg, prd).
   */
  readonly stageName: string;

  /**
   * Severity of the `Microservices-ResourceDescription` rule.
   * WARN lets teams adopt the rule without blocking synth.
   *
   * @default NagMessageLevel.ERROR
   */
  readonly resourceDescriptionLevel?:
    NagMessageLevel.ERROR | NagMessageLevel.WARN;
}

/**
 * Microservice Checks are a compilation of rules to validate infrastructure-as-code template
 * against recommended practices using the cdk-nag library.
 *
 * @see https://github.com/cdk-patterns/cdk-nag/
 *
 * @example
 * const app = new App();
 * const stack = new Stack(app, 'MyStack', { description: 'Order service' });
 * Aspects.of(stack).add(new MicroserviceChecks({ stageName: 'prd' }), {
 *   priority: AspectPriority.READONLY,
 * });
 */
export class MicroserviceChecks extends NagPack {
  private readonly stageName: string;
  private readonly resourceDescriptionLevel:
    NagMessageLevel.ERROR | NagMessageLevel.WARN;

  constructor(props: MicroserviceChecksProps) {
    super(props);
    this.packName = "Microservices";

    if (!/^[a-z0-9]{3}$/.test(props.stageName)) {
      throw new Error(
        `stageName must be exactly 3 lowercase alphanumeric characters, got: "${props.stageName}"`
      );
    }
    this.stageName = props.stageName;

    const level = props.resourceDescriptionLevel ?? NagMessageLevel.ERROR;
    if (level !== NagMessageLevel.ERROR && level !== NagMessageLevel.WARN) {
      throw new Error(
        `resourceDescriptionLevel must be NagMessageLevel.ERROR or NagMessageLevel.WARN, got: "${level}"`
      );
    }
    this.resourceDescriptionLevel = level;
  }

  public visit(node: IConstruct) {
    if (isCdkManagedSingleton(node)) return;

    if (node instanceof Stack) {
      this.checkStackDescription(node);
    }

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
        /** The rule is an anonymous closure, so cdk-nag can't derive a usable ID from its name. */
        ruleSuffixOverride: "ApiGatewayStageName",
        node: node,
      });
      this.applyRule({
        info: "The resource does not have a description.",
        explanation: `A description documents the resource's purpose in the AWS console, which speeds up incident triage and ownership lookups. Set the \`description\` prop on Lambda functions, API Gateway REST/HTTP APIs, EventBridge rules/schedules/pipes, SSM parameters, Secrets Manager secrets and KMS keys. Add a \`${DESCRIPTION_TAG_KEY}\` tag to S3 buckets, DynamoDB tables, SQS queues and SNS topics. Set the state machine \`comment\` or add a \`${DESCRIPTION_TAG_KEY}\` tag to Step Functions state machines.`,
        level: this.resourceDescriptionLevel,
        rule: resourceDescription,
        ruleSuffixOverride: "ResourceDescription",
        node: node,
      });
    }
  }

  /**
   * Stacks aren't CfnResources, so this reports through Annotations directly instead of cdk-nag.
   */
  private checkStackDescription(stack: Stack) {
    if (stack.templateOptions.description?.trim()) return;

    const ruleId = `${this.packName}-StackDescription`;
    if (isStackSuppressed(stack, ruleId)) return;

    Annotations.of(stack).addError(
      `${ruleId}: The stack does not have a description. Set the \`description\` prop on the Stack so its purpose is visible in the CloudFormation console.`
    );
  }
}
