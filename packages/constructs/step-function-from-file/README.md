# Aligent AWS Step Function From File

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/step-function-from-file/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/step-function-from-file/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-step-function-from-file?color=green)

A Step Function construct that loads its definition from a YAML or JSON file.

```typescript
import { StepFunctionFromFile } from "@libs/cdk-utils/infra";

// Basic usage
new StepFunctionFromFile(this, "MyStateMachine", {
  filepath: "src/step-functions/workflow.yml",
});

// With Lambda function substitutions
new StepFunctionFromFile(this, "WorkflowWithLambdas", {
  filepath: "src/step-functions/workflow.yml",
  lambdaFunctions: [myLambda1, myLambda2],
  definitionSubstitutions: {
    MyCustomParam: "CustomValue",
  },
});
```
