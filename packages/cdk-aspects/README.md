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
