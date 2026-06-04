---
"@aligent/cdk-aspects": patch
---

Fix `ResourcePrefixAspect` to skip CDK-managed singleton/framework resources (`BucketDeployment` handler, `LogRetention`, `S3AutoDeleteObjects`, and `cr.Provider` framework lambdas) instead of pinning deterministic physical names onto them. Pinning a deterministic name removed CloudFormation's random-suffix orphan-avoidance, so a failed deploy could orphan the service-created `/aws/lambda/<fn>` log group and wedge every subsequent deploy on `AWS::Logs::LogGroup ... already exists`. The aspect now leaves these resources CloudFormation-named, matching the singleton-skip behaviour `MicroserviceChecks` already applies.
