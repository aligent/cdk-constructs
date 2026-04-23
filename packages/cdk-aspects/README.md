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


## Microservice Checks

A set of rules that validate your infrastructure against recommended practices using the cdk-nag library.

### Features

- Validates Lambda function memory configuration
- Validates Lambda function timeout configuration
- Validates Lambda function tracing configuration
- Validates CloudWatch Log Group retention policy

### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { MicroserviceChecks } from "@aligent/cdk-aspects";

const app = new App();
const stack = new Stack(app, "MyStack");

Aspects.of(stack).add(new MicroserviceChecks());
```

## Resource Prefix

Automatically prefixes physical resource names across supported AWS resource types. Ensures all resources in a stack share a consistent naming scheme (e.g. `myapp-prod-orders-function`), which is especially useful for identifying resources by environment or service in the AWS console.

### Features

- Prefixes names for Lambda functions, S3 buckets, DynamoDB tables, SQS queues, SNS topics, IAM roles, SSM parameters, Step Functions, EventBridge rules, and more
- Handles resource-specific naming rules: S3 names are lowercased, FIFO queues/topics preserve the `.fifo` suffix, SSM parameters use path-style prefixes (`/prefix/name`)
- **Automatic truncation**: if a prefixed name would exceed AWS's maximum length for that resource type, the aspect truncates the name and appends an 8-character SHA-256 hash to maintain uniqueness. A CDK warning is emitted for each truncated resource. This prevents L3 constructs (e.g. `BucketDeployment`) from generating child resources that cause synthesis failures.
- Idempotent: already-prefixed resources are skipped
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
