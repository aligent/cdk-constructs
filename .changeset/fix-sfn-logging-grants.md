---
"@aligent/cdk-aspects": patch
---

Fixed `StepFunctionsDefaultsAspect` missing IAM grants for CloudWatch Logs delivery. The aspect was setting `loggingConfiguration` directly on the L1 `CfnStateMachine`, bypassing CDK's IAM grant mechanism. The state machine role now receives the required `logs:*` permissions, preventing the `"IAM Role is not authorized to access the Log Destination"` CloudFormation error on deployment.
