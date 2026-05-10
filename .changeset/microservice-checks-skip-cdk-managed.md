---
"@aligent/cdk-aspects": minor
---

`MicroserviceChecks` now skips CDK-managed singleton resources (BucketDeployment custom handler, `LogRetention`, `Custom::S3AutoDeleteObjects`, and `cr.Provider` framework lambdas). These nodes have framework-owned runtime config that consumers cannot tune, so surfacing memory size, timeout, tracing, and log retention nags on them is noise. Consumers no longer need bespoke suppression aspects for these resources.
