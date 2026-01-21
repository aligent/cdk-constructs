# Aligent CDK Aspects

This package provides a collection of CDK aspects that can be applied to your AWS CDK stacks to enforce best practices and automate common configurations.

## Defaults

### Microservice Checks

A set of rules that validate your infrastructure against recommended practices using the cdk-nag library.

#### Features

- Validates Lambda function memory configuration
- Validates Lambda function timeout configuration
- Validates Lambda function tracing configuration
- Validates CloudWatch Log Group retention policy

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { MicroserviceChecks } from "@aligent/cdk-aspects";

const app = new App();
const stack = new Stack(app, "MyStack");

Aspects.of(stack).add(new MicroserviceChecks());
```

### Version Functions

An aspect that automatically adds versioning and aliases to Lambda functions and Step Functions.

#### Features

- Automatically creates function aliases for Lambda functions
- Creates versions and aliases for Step Functions with 100% traffic routing
- Supports custom alias names

#### Usage

```typescript
import { Aspects } from "aws-cdk-lib";
import { VersionFunctionsAspect } from "@aligent/cdk-aspects";

const app = new App();
Aspects.of(app).add(new VersionFunctionsAspect({ alias: "PROD" }));
```
