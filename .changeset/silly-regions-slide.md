---
"@aligent/cdk-aspects": patch
---

Fix ResourcePrefixAspect to gracefully handle CDK tokens (e.g. `Fn.ref`, `Lazy.string`) in resource name properties by falling back to the sanitised logical ID.
