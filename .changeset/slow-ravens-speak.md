---
"@aligent/cdk-nodejs-function-from-entry": minor
"@aligent/cdk-step-function-from-file": minor
---

Add `NodejsFunctionFromEntry` construct for type-safe Lambda function creation from entry files with automatic source-to-dist path resolution. Update `StepFunctionFromFile` to use a `baseDir`-relative filepath pattern with a typed prefix constraint, preventing file inclusion attacks.
