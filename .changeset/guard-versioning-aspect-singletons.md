---
"@aligent/cdk-aspects": patch
---

Skip CDK-managed singleton/framework resources in `LambdaAndStepFunctionVersioningAspect` so it no longer adds aliases/versions to handlers like the `BucketDeployment` custom resource.
