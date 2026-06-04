---
"@aligent/cdk-aspects": patch
---

Fix `ResourcePrefixAspect` to skip CDK-managed singleton/framework resources (`BucketDeployment` handler, `LogRetention`, `S3AutoDeleteObjects`, and `cr.Provider` framework lambdas) and their nested children (IAM service roles, log groups) instead of pinning deterministic physical names onto them.

These singletons share a fixed logical id across every stack, so a deterministic prefixed name collapses to one value per prefix scope. That removed CloudFormation's per-stack and per-creation uniqueness and caused two deploy failures:

- **Cross-stack IAM role collision** — two `BucketDeployment`-using stacks in the same stage received the same account-global `RoleName`, so the second stack failed with `... already exists`.
- **Orphaned `/aws/lambda` log group collision on retry** — a failed deploy orphaned the service-created log group, and the deterministic function name regenerated the identical name, wedging every subsequent deploy on `AWS::Logs::LogGroup ... already exists`.

The aspect now leaves these resources CloudFormation-named, matching the singleton-skip behaviour `MicroserviceChecks` already applies.
