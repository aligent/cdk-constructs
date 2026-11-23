# Aligent CDK Aspects

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/cdk-aspects/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/cdk-aspects/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-aspects?color=green)

This package provides a collection of CDK aspects that can be applied to your AWS CDK stacks to enforce best practices and automate common configurations.

## Defaults

A collection of aspects that automatically apply best-practice defaults to AWS resources in your CDK stacks.

### Log Group Defaults

Automatically applies configuration-aware defaults to CloudWatch Log Groups, balancing between cost optimization and data retention needs.

#### Features

- Automatically configures retention periods based on duration profile
- Applies appropriate removal policies
- Retention is a default, removal policy is an override:
  - L2 `LogGroup` with no `retention` gets the profile retention
  - Any other explicit `retention` (including `RetentionDays.INFINITE`) is respected
  - An explicit `RetentionDays.TWO_YEARS` is overridden, since CDK renders an omitted `retention` as the same value
- Only L2 `LogGroup`s are covered; raw `CfnLogGroup`s are left untouched
- Duration profiles:
  - **SHORT**: 1 week retention, destroy on stack deletion
  - **MEDIUM**: 6 months retention, destroy on stack deletion
  - **LONG**: 2 years retention, retain on stack deletion

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { LogGroupDefaultsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new LogGroupDefaultsAspect({ duration: "SHORT" }));
```

### Node.js Function Defaults

Automatically applies configuration-aware defaults to Node.js Lambda functions for consistent runtime configuration and observability.

#### Features

- Configures Node.js runtime version
- Enables X-Ray tracing by default
- Optionally enables source maps for better error stack traces (default: enabled)
- Configures default memory size (default: 256 MB)
- Configures default timeout (default: 3 seconds)

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodeJsFunctionDefaultsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(
  new NodeJsFunctionDefaultsAspect({
    runtime: Runtime.NODEJS_24_X,
    sourceMap: true, // default: true
    memorySize: 256, // default: 256
    timeout: 3, // default: 3
  })
);
```

### Step Functions Defaults

Automatically applies tracing and logging settings to AWS Step Functions state machines for enhanced observability.

#### Features

- Enables X-Ray tracing for all state machines
- Automatically creates log groups for EXPRESS state machines
- Configures comprehensive logging with full execution data capture

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { StepFunctionsDefaultsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new StepFunctionsDefaultsAspect());
```

### DynamoDB Defaults

Automatically applies configuration-aware billing mode, throughput, and removal-policy defaults to DynamoDB tables.

#### Features

- Sets billing mode, throughput, and removal policy based on the duration profile
- Duration profiles:
  - **SHORT**: `PROVISIONED` (1 RCU / 1 WCU), destroy on stack deletion
  - **MEDIUM**: `PAY_PER_REQUEST` capped at 100 max read / 100 max write request units, destroy on stack deletion
  - **LONG**: `PAY_PER_REQUEST` uncapped, retain on stack deletion
- Treats throughput as a **default, not an override**: values set on the `Table` construct are respected. To lift the MEDIUM cap on a high-throughput table, set the throughput explicitly on that table (billing mode included, so the value survives CDK's L2 defaults):

  ```typescript
  new Table(stack, "HighWriteTable", {
    partitionKey: { name: "pk", type: AttributeType.STRING },
    billingMode: BillingMode.PAY_PER_REQUEST,
    maxReadRequestUnits: 4000,
    maxWriteRequestUnits: 4000,
  });
  ```

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { DynamoDbDefaultsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new DynamoDbDefaultsAspect({ duration: "MEDIUM" }));
```

### S3 Bucket Defaults

Automatically applies configuration-aware object expiry, auto-delete, and removal-policy defaults to S3 buckets.

#### Features

- Duration profiles:
  - **SHORT**: objects expire after 30 days, auto-delete objects, destroy on stack deletion
  - **MEDIUM**: objects expire after 90 days, auto-delete objects, destroy on stack deletion
  - **LONG**: no expiry, retain on stack deletion
- Expiry is a **default, not an override**: it is only added to L2 `Bucket`s with no `lifecycleRules` of their own
- Buckets that set `autoDeleteObjects: true` themselves are honoured in every profile, including **LONG**: the aspect keeps their `DESTROY` removal policy and does not register auto-delete twice
- To opt a bucket out of expiry (e.g. an SPA bucket only filled on deploy), give it a lifecycle rule that does not expire current objects:

  ```typescript
  new Bucket(stack, "SpaBucket", {
    lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7) }],
  });
  ```

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { S3DefaultsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new S3DefaultsAspect({ duration: "SHORT" }));
```


## Microservice Checks

A set of rules that validate your infrastructure against recommended practices using the cdk-nag library.

> [!IMPORTANT]
> `cdk-nag` is a peer dependency and must be **v2** (`^2.38.2`). cdk-nag v3 replaced aspect-based packs with `Validations` plugins, so under v3 these checks run but report nothing.

### Features

- Validates Lambda function memory configuration
- Validates Lambda function timeout configuration
- Validates Lambda function tracing configuration
- Validates CloudWatch Log Group retention policy
- Validates API Gateway stage name matches the expected value (must be exactly 3 lowercase alphanumeric characters, e.g. `dev`, `stg`, `prd`)
- Validates key resources have a non-blank description (see [Describing resources](#describing-resources))
- Validates stacks (including nested stacks) have a non-blank description

### Usage

```typescript
import { App, AspectPriority, Aspects, Stack } from "aws-cdk-lib";
import { MicroserviceChecks } from "@aligent/cdk-aspects";

const app = new App();
const stack = new Stack(app, "MyStack", { description: "Order service" });

Aspects.of(stack).add(new MicroserviceChecks({ stageName: "prd" }), {
  priority: AspectPriority.READONLY,
});
```

> [!NOTE]
> Add the checks with `AspectPriority.READONLY` (CDK ≥ 2.172) so they run after every mutating aspect.
> Without it, tags added via `Tags.of(construct)` and changes made by the Defaults aspects may not be visible to the checks, unless the `@aws-cdk/core:aspectPrioritiesMutating` feature flag is enabled.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `stageName` | `string` | — | Expected API Gateway stage name (exactly 3 lowercase alphanumeric characters) |
| `resourceDescriptionLevel` | `NagMessageLevel.ERROR \| NagMessageLevel.WARN` | `ERROR` | Severity of `Microservices-ResourceDescription`. Use `WARN` to adopt the rule without blocking synth |

Any other [`NagPackProps`](https://github.com/cdklabs/cdk-nag#nagpackprops) (e.g. `verbose`, `reports`) are passed through to cdk-nag.

### Describing resources

`Microservices-ResourceDescription` only checks the resource types below. A resource passes if any accepted source is non-blank. Values that can't be resolved at synth time (e.g. `Fn::Sub`, `Fn::Join`) also pass.

| Resource | Accepted sources |
|---|---|
| Lambda function | `description` prop |
| API Gateway REST API / HTTP API | `description` prop |
| EventBridge rule / Scheduler schedule / Pipe | `description` prop |
| SSM parameter / Secrets Manager secret / KMS key | `description` prop |
| S3 bucket / DynamoDB table (v1 `Table`) / SQS queue / SNS topic | `Description` tag |
| Step Functions state machine | `comment` prop (top-level ASL `Comment`) |

- Types with a native `description` prop must use it; a `Description` tag doesn't count for them.
- File-based state machine definitions (e.g. `DefinitionBody.fromFile`, `@aligent/cdk-step-function-from-file`) are uploaded to S3, so their `Comment` can't be read at synth time. They always fail, so suppress `Microservices-ResourceDescription` for them (see [Suppressing findings](#suppressing-findings)).
- Tag values are limited to 256 characters and, on many services, to letters, digits, spaces and `+ - = . _ : / @`. Commas and apostrophes can fail at deploy time.

```typescript
new Function(stack, "OrderHandler", { description: "Creates orders from checkout events", ... });
Tags.of(new Bucket(stack, "OrderExports")).add("Description", "Nightly order exports");
```

### Rule IDs

| Rule ID | Checks |
|---|---|
| `Microservices-LambdaDefaultMemorySize` | Lambda has an explicit memory size |
| `Microservices-LambdaDefaultTimeout` | Lambda has an explicit timeout |
| `Microservices-LambdaTracing` | Lambda tracing is `ACTIVE` |
| `Microservices-CloudWatchLogGroupRetentionPeriod` | Log group has an explicit retention |
| `Microservices-ApiGatewayStageName` | API Gateway stage name matches `stageName` |
| `Microservices-ResourceDescription` | Resource has a description ([see above](#describing-resources)) |
| `Microservices-StackDescription` | Stack has a description |

### Suppressing findings

Resources created inside constructs you don't own (e.g. third-party constructs) can be suppressed per resource:

```typescript
import { NagSuppressions } from "cdk-nag";

NagSuppressions.addResourceSuppressions(
  thirdPartyConstruct,
  [{ id: "Microservices-ResourceDescription", reason: "Owned by a third-party construct" }],
  true // apply to children
);
```

`Microservices-StackDescription` is reported directly on the stack rather than through cdk-nag, so it doesn't appear in cdk-nag reports. It still honours stack suppressions, e.g. for CDK-generated stacks such as `edge-lambda-stack-*` when the checks are applied at app level:

```typescript
NagSuppressions.addStackSuppressions(edgeStack, [
  { id: "Microservices-StackDescription", reason: "CDK-generated support stack" },
]);
```

## Resource Prefix

Automatically prefixes physical resource names across supported AWS resource types. Ensures all resources in a stack share a consistent naming scheme (e.g. `myapp-prod-orders-function`), which is especially useful for identifying resources by environment or service in the AWS console.

### Features

- Prefixes names for Lambda functions, S3 buckets, DynamoDB tables, SQS queues, SNS topics, IAM roles, SSM parameters, Step Functions, EventBridge rules, and more
- Handles resource-specific naming rules: S3 names are lowercased, FIFO queues/topics preserve the `.fifo` suffix, SSM parameters use path-style prefixes (`/prefix/name`)
- **Automatic truncation**: if a prefixed name would exceed AWS's maximum length for that resource type, the aspect truncates the name and appends an 8-character SHA-256 hash to maintain uniqueness. A CDK warning is emitted for each truncated resource. This prevents L3 constructs (e.g. `BucketDeployment`) from generating child resources that cause synthesis failures.
- Idempotent: already-prefixed resources are skipped
- Skips AWS-reserved log group names (`/aws/...`, e.g. `/aws/lambda/...`, and `aws-waf-logs-...`, the prefix WAF requires for its log destination)
- Skips CDK-managed singleton/framework resources (`BucketDeployment` handler, `LogRetention`, `S3AutoDeleteObjects`, and `cr.Provider` framework lambdas) and their nested children (IAM service roles, log groups). These singletons share a fixed logical id across every stack, so a deterministic prefixed name collapses to one value per prefix scope. Leaving them CloudFormation-generated preserves the per-stack and per-creation uniqueness that prevents account-global IAM role collisions across stacks and orphaned `/aws/lambda` log group collisions on retry.
- Supports an exclusion list to skip specific resource types

### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { ResourcePrefixAspect } from "@aligent/cdk-aspects";

const stage = new ApplicationStage(app, "prod");
Aspects.of(stage).add(new ResourcePrefixAspect({ prefix: "myapp-prod" }));
```

Excluding specific resource types:

```typescript
Aspects.of(stage).add(
  new ResourcePrefixAspect({
    prefix: "myapp-prod",
    exclude: ["AWS::IAM::Role"],
  })
);
```

### Truncation behaviour

When a prefixed name exceeds the AWS maximum for its resource type, the aspect:

1. Hashes the full (pre-truncation) name with SHA-256 and takes the first 8 hex characters
2. Truncates the name to fit within the limit, preserving any required suffix (e.g. `.fifo`)
3. Emits a `cdk synth` warning identifying the original and truncated name

This applies to all overflows, including explicitly user-set names. The warning tells you which resources were affected so you can shorten the base name or prefix if desired.

Example warning:
```
[ResourcePrefixAspect] "myapp-prod-VeryLongGeneratedFunctionName" (72 chars) exceeds the maximum allowed length of 64. Name has been truncated to "myapp-prod-VeryLongGenerate-a3f9c2d1". Shorten the resource base name or your prefix ("myapp-prod") to avoid truncation.
```

### Critical notes

- **Apply to each `Stage`, not the `App`**: CDK Stage constructs create synthesis boundaries. Apply the aspect to each Stage individually.
- **Aspect priority with versioning**: when combining with `LambdaAndStepFunctionVersioningAspect`, apply this aspect first using CDK's priority system (lower number = runs first):

```typescript
Aspects.of(stage).add(new ResourcePrefixAspect({ prefix: "myapp" }), { priority: 100 });
Aspects.of(stage).add(new LambdaAndStepFunctionVersioningAspect(), { priority: 200 });
```

## Version Functions

An aspect that automatically adds versioning and aliases to Lambda functions and Step Functions.

### Features

- Automatically creates function aliases for Lambda functions
- Creates versions and aliases for Step Functions with 100% traffic routing
- Supports custom alias names

### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { VersionFunctionsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new VersionFunctionsAspect({ alias: "PROD" }));
```
