import { Annotations, CfnResource, IAspect, Stack } from "aws-cdk-lib";
import { IConstruct } from "constructs";

interface ResourceNameConfig {
  /** The CloudFormation property that holds the resource's physical name */
  property: string;
  /** Maximum allowed character length for this resource type */
  maxLength: number;
}

/**
 * Extension type to access internal CloudFormation properties on CfnResource.
 *
 * CDK does not provide a public API to read raw CloudFormation properties that have
 * been set on a CfnResource. The properties `_cfnProperties` and `cfnProperties` are
 * protected and only accessible within the CfnResource class hierarchy.
 *
 * We investigated using CDK's public APIs, but there is no public method to retrieve
 * the raw property values that have been set (e.g., via constructor props or addPropertyOverride).
 * The only public APIs are for writing (addPropertyOverride, addPropertyDeletionOverride) or
 * getting attribute references (getAtt), not for reading literal property values.
 *
 * This type assertion is safe because:
 * - We only read these properties, never modify them
 * - We need to check if a user explicitly set a name property before applying our prefix
 * - The properties exist at runtime and are part of CDK's internal implementation
 */
type CfnResourceWithProps = CfnResource & {
  readonly _cfnProperties?: Record<string, unknown>;
  readonly cfnProperties?: Record<string, unknown>;
};

/**
 * Maps CloudFormation resource types to their name property and AWS length limits.
 * Sources: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html
 */
const RESOURCE_CONFIG: Record<string, ResourceNameConfig> = {
  // Compute
  "AWS::Lambda::Function": { property: "FunctionName", maxLength: 64 },

  // Storage
  "AWS::S3::Bucket": { property: "BucketName", maxLength: 63 },
  "AWS::DynamoDB::Table": { property: "TableName", maxLength: 255 },
  "AWS::DynamoDB::GlobalTable": { property: "TableName", maxLength: 255 },

  // Messaging
  "AWS::SQS::Queue": { property: "QueueName", maxLength: 80 },
  "AWS::SNS::Topic": { property: "TopicName", maxLength: 256 },

  // Eventing & Orchestration
  "AWS::Events::EventBus": { property: "Name", maxLength: 256 },
  "AWS::Events::Rule": { property: "Name", maxLength: 64 },
  "AWS::Events::Connection": { property: "Name", maxLength: 64 },
  "AWS::Pipes::Pipe": { property: "Name", maxLength: 64 },
  "AWS::StepFunctions::StateMachine": {
    property: "StateMachineName",
    maxLength: 80,
  },
  "AWS::StepFunctions::Activity": { property: "Name", maxLength: 80 },
  "AWS::Scheduler::Schedule": { property: "Name", maxLength: 64 },
  "AWS::Scheduler::ScheduleGroup": { property: "Name", maxLength: 64 },

  // API
  "AWS::ApiGateway::RestApi": { property: "Name", maxLength: 128 },
  "AWS::ApiGateway::UsagePlan": { property: "UsagePlanName", maxLength: 128 },
  "AWS::ApiGateway::ApiKey": { property: "Name", maxLength: 128 },
  "AWS::ApiGatewayV2::Api": { property: "Name", maxLength: 128 },
  "AWS::ApiGatewayV2::Authorizer": { property: "Name", maxLength: 128 },

  // Secrets & Config
  "AWS::SecretsManager::Secret": { property: "Name", maxLength: 512 },
  "AWS::SSM::Parameter": { property: "Name", maxLength: 2048 },
  "AWS::AppConfig::Application": { property: "Name", maxLength: 64 },
  "AWS::AppConfig::Environment": { property: "Name", maxLength: 64 },

  // Notifications
  "AWS::Notifications::NotificationConfiguration": {
    property: "Name",
    maxLength: 64,
  },

  // Observability
  "AWS::Logs::LogGroup": { property: "LogGroupName", maxLength: 512 },
  "AWS::CloudWatch::Alarm": { property: "AlarmName", maxLength: 255 },

  // IAM
  "AWS::IAM::Role": { property: "RoleName", maxLength: 64 },
};

export interface ResourcePrefixAspectProps {
  /**
   * The prefix to apply to all resource names.
   * e.g. 'myapp-prod' → 'myapp-prod-orders'
   */
  prefix: string;

  /**
   * Resource types to skip entirely.
   * e.g. ['AWS::IAM::Role'] to leave IAM role names untouched.
   * @default []
   */
  exclude?: string[];
}

/**
 * CDK Aspect that automatically prefixes physical resource names across AWS resources.
 *
 * @remarks
 * **Critical Implementation Notes:**
 *
 * 1. **Stage Synthesis Boundaries**:
 *    - CDK `Stage` constructs create synthesis boundaries that prevent App-level aspects
 *      from traversing into them
 *    - This aspect MUST be applied to each Stage individually, not to the App
 *    - Example: `Aspects.of(stage).add(new ResourcePrefixAspect({...}))`
 *
 * 2. **Property Name Casing**:
 *    - CloudFormation properties use PascalCase (e.g., `FunctionName`, `BucketName`)
 *    - Using camelCase (e.g., `functionName`) will cause errors with versioning aspects
 *    - When using `addPropertyOverride()`, always use the exact CloudFormation property name
 *
 * 3. **Aspect Priority with Versioning**:
 *    - When combining with LambdaAndStepFunctionVersioningAspect, apply this aspect BEFORE versioning
 *    - Use CDK's priority system: `Aspects.of(stage).add(prefixAspect, { priority: 100 })`
 *    - Then: `Aspects.of(stage).add(versioningAspect, { priority: 200 })`
 *    - Lower priority numbers run first
 *
 * @example
 * ```typescript
 * // Correct usage with staging
 * const stage = new ApplicationStage(app, 'prod');
 * Aspects.of(stage).add(new ResourcePrefixAspect({ prefix: 'myapp' }), { priority: 100 });
 * Aspects.of(stage).add(new LambdaAndStepFunctionVersioningAspect(), { priority: 200 });
 * ```
 */
export class ResourcePrefixAspect implements IAspect {
  private readonly prefix: string;
  private readonly exclude: Set<string>;

  constructor(props: ResourcePrefixAspectProps) {
    if (!props.prefix)
      throw new Error(
        "ResourcePrefixAspect: prefix must be a non-empty string"
      );
    this.prefix = props.prefix;
    this.exclude = new Set(props.exclude ?? []);
  }

  visit(node: IConstruct) {
    if (!(node instanceof CfnResource)) return;

    const resourceType = node.cfnResourceType;
    const config = RESOURCE_CONFIG[resourceType];

    if (!config || this.exclude.has(resourceType)) return;

    const { property, maxLength } = config;

    const baseName =
      this.getRawName(node as CfnResourceWithProps, property) ||
      this.deriveNameFromLogicalId(node);

    // Skip if already prefixed (idempotency guard)
    if (baseName.startsWith(`${this.prefix}-`)) return;

    const finalName = `${this.prefix}-${baseName}`;

    if (finalName.length > maxLength) {
      // Throw a hard error at synth time — fail fast before any deployment
      Annotations.of(node).addError(
        `[ResourcePrefixAspect] "${finalName}" (${finalName.length} chars) exceeds the ` +
          `maximum allowed length of ${maxLength} for ${resourceType}. ` +
          `Shorten the resource base name or your prefix ("${this.prefix}").`
      );
      return;
    }

    node.addPropertyOverride(property, finalName);
  }

  private getRawName(node: CfnResourceWithProps, property: string) {
    const props = node._cfnProperties ?? node.cfnProperties ?? {};
    const val = props[property];
    return typeof val === "string" ? val : undefined;
  }

  private deriveNameFromLogicalId(node: CfnResource) {
    const logicalId = Stack.of(node).getLogicalId(node);
    return logicalId
      .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase → kebab-case
      .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanumeric → dash
      .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
      .toLowerCase();
  }
}
