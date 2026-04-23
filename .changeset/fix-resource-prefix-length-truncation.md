---
"@aligent/cdk-aspects": patch
---

Fixed `ResourcePrefixAspect` failing synthesis when a prefixed resource name exceeds the AWS maximum length. The aspect now truncates the name and appends an 8-character SHA-256 hash to maintain uniqueness, and emits a `cdk synth` warning identifying the original and truncated name. This prevents L3 constructs (e.g. `BucketDeployment`) from generating child resources that the user has no control over causing failed deployments.
