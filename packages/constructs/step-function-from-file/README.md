# Aligent AWS Step Function From File

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
