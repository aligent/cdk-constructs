import { createHash } from "crypto";
import { Annotations, CfnResource, IAspect, Stack } from "aws-cdk-lib";
import { IConstruct } from "constructs";

interface ResourceNameConfig {
  /** The CloudFormation property that holds the resource's physical name */
  cfnName: string;
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
  "AWS::Lambda::Function": { cfnName: "FunctionName", maxLength: 64 },

  // Storage
  "AWS::S3::Bucket": { cfnName: "BucketName", maxLength: 63 },
  "AWS::DynamoDB::Table": { cfnName: "TableName", maxLength: 255 },
  "AWS::DynamoDB::GlobalTable": { cfnName: "TableName", maxLength: 255 },

  // Messaging
  "AWS::SQS::Queue": { cfnName: "QueueName", maxLength: 80 },
  "AWS::SNS::Topic": { cfnName: "TopicName", maxLength: 256 },

  // Eventing & Orchestration
  "AWS::Events::EventBus": { cfnName: "Name", maxLength: 256 },
  "AWS::Events::Rule": { cfnName: "Name", maxLength: 64 },
  "AWS::Events::Connection": { cfnName: "Name", maxLength: 64 },
  "AWS::Pipes::Pipe": { cfnName: "Name", maxLength: 64 },
  "AWS::StepFunctions::StateMachine": {
    cfnName: "StateMachineName",
    maxLength: 80,
  },
  "AWS::StepFunctions::Activity": { cfnName: "Name", maxLength: 80 },
  "AWS::Scheduler::Schedule": { cfnName: "Name", maxLength: 64 },
  "AWS::Scheduler::ScheduleGroup": { cfnName: "Name", maxLength: 64 },

  // API
  "AWS::ApiGateway::RestApi": { cfnName: "Name", maxLength: 128 },
  "AWS::ApiGateway::UsagePlan": { cfnName: "UsagePlanName", maxLength: 128 },
  "AWS::ApiGateway::ApiKey": { cfnName: "Name", maxLength: 128 },
  "AWS::ApiGatewayV2::Api": { cfnName: "Name", maxLength: 128 },
  "AWS::ApiGatewayV2::Authorizer": { cfnName: "Name", maxLength: 128 },

  // Secrets & Config
  "AWS::SecretsManager::Secret": { cfnName: "Name", maxLength: 512 },
  "AWS::SSM::Parameter": { cfnName: "Name", maxLength: 2048 },
  "AWS::AppConfig::Application": { cfnName: "Name", maxLength: 64 },
  "AWS::AppConfig::Environment": { cfnName: "Name", maxLength: 64 },

  // Notifications
  "AWS::Notifications::NotificationConfiguration": {
    cfnName: "Name",
    maxLength: 64,
  },

  // Observability
  "AWS::Logs::LogGroup": { cfnName: "LogGroupName", maxLength: 512 },
  "AWS::CloudWatch::Alarm": { cfnName: "AlarmName", maxLength: 255 },

  // IAM
  "AWS::IAM::Role": { cfnName: "RoleName", maxLength: 64 },
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
    if (!props.prefix || !/^[a-z0-9-]+$/.test(props.prefix))
      throw new Error(
        `ResourcePrefixAspect: prefix must contain only lowercase alphanumeric characters and hyphens, got "${props.prefix}"`
      );

    this.prefix = props.prefix;
    this.exclude = new Set(props.exclude ?? []);
  }

  visit(node: IConstruct) {
    if (!(node instanceof CfnResource)) return;

    const resourceType = node.cfnResourceType;
    const config = RESOURCE_CONFIG[resourceType];

    if (!config || this.exclude.has(resourceType)) {
      return;
    }

    const { cfnName, maxLength } = config;
    const cfnProperties: Record<string, unknown> =
      (node as CfnResourceWithProps)._cfnProperties ??
      (node as CfnResourceWithProps).cfnProperties ??
      {};

    // Get any explicitly set name, or derive one from the logical ID
    const existingName =
      typeof cfnProperties[cfnName] === "string"
        ? cfnProperties[cfnName]
        : undefined;
    const baseName = existingName ?? this.deriveNameFromLogicalId(node);

    if (this.isAlreadyPrefixed(baseName)) {
      return;
    }

    const prefixedName = this.buildPrefixedName(
      baseName,
      resourceType,
      cfnProperties
    );

    // Truncation applies to all overflows — including user-set names — because L3
    // constructs can generate names the user has no direct control over.
    const finalName = this.truncateToFit(prefixedName, maxLength, node);

    const hasError = this.validateResourceName(finalName, resourceType, node);

    if (hasError) return;

    node.addPropertyOverride(cfnName, finalName);
  }

  private isAlreadyPrefixed(name: string): boolean {
    return (
      name.startsWith(`${this.prefix}-`) || name.startsWith(`/${this.prefix}/`)
    );
  }

  private deriveNameFromLogicalId(node: CfnResource) {
    const logicalId = Stack.of(node).getLogicalId(node);
    return logicalId
      .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanumeric → dash
      .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
  }

  /**
   * Builds the prefixed name, handling special cases for specific resource types.
   *
   * @param baseName - The base resource name (without prefix)
   * @param cfnResourceType - The CloudFormation resource type
   * @param cfnProperties - The CloudFormation resource properties
   * @returns The final prefixed name with any special case handling applied
   */
  private buildPrefixedName(
    baseName: string,
    cfnResourceType: string,
    cfnProperties: Record<string, unknown>
  ): string {
    // Special case: FIFO queues must end with .fifo suffix
    if (
      cfnResourceType === "AWS::SQS::Queue" &&
      cfnProperties.fifoQueue === true &&
      !baseName.endsWith(".fifo")
    ) {
      return `${this.prefix}-${baseName}.fifo`;
    }

    // Special case: FIFO topics must end with .fifo suffix
    if (
      cfnResourceType === "AWS::SNS::Topic" &&
      cfnProperties.fifoTopic === true &&
      !baseName.endsWith(".fifo")
    ) {
      return `${this.prefix}-${baseName}.fifo`;
    }

    // Special case: SSM parameter names use path-style prefix
    if (cfnResourceType === "AWS::SSM::Parameter") {
      return `/${this.prefix}/${baseName}`;
    }

    // Special case: S3 bucket name be lowercase only
    if (cfnResourceType === "AWS::S3::Bucket") {
      return `${this.prefix}-${baseName}`.toLowerCase();
    }

    // Default: simple prefix
    return `${this.prefix}-${baseName}`;
  }

  /**
   * Truncates a prefixed name to fit within maxLength by hashing the original
   * for uniqueness. Emits a CDK warning when truncation occurs.
   */
  private truncateToFit(
    name: string,
    maxLength: number,
    node: IConstruct
  ): string {
    if (name.length <= maxLength) return name;

    const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);

    // Preserve .fifo suffix — AWS requires it at the end of FIFO resource names
    const suffix = name.endsWith(".fifo") ? ".fifo" : "";
    const nameWithoutSuffix = suffix ? name.slice(0, -suffix.length) : name;

    // 1 accounts for the dash separator before the hash
    const budget = maxLength - hash.length - 1 - suffix.length;
    const truncated = nameWithoutSuffix.slice(0, budget) + "-" + hash + suffix;

    Annotations.of(node).addWarning(
      `[ResourcePrefixAspect] "${name}" (${name.length} chars) exceeds the maximum allowed length of ${maxLength}. ` +
        `Name has been truncated to "${truncated}". Shorten the resource base name or your prefix ("${this.prefix}") to avoid truncation.`
    );

    return truncated;
  }

  /**
   * Validates resource-specific structural naming requirements that AWS enforces.
   * Length violations are handled upstream by truncateToFit.
   */
  private validateResourceName(
    name: string,
    cfnResourceType: string,
    node: IConstruct
  ): boolean {
    let hasError = false;

    if (cfnResourceType === "AWS::S3::Bucket") {
      if (name !== name.toLowerCase()) {
        Annotations.of(node).addError(
          `[ResourcePrefixAspect] S3 bucket name "${name}" contains uppercase letters. ` +
            `Bucket names must be lowercase only.`
        );
        hasError = true;
      }

      if (name.includes("_")) {
        Annotations.of(node).addError(
          `[ResourcePrefixAspect] S3 bucket name "${name}" contains underscores. ` +
            `Bucket names cannot contain underscores. Use hyphens instead.`
        );
        hasError = true;
      }
    }

    return hasError;
  }
}
