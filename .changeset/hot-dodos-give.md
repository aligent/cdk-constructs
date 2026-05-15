---
"@aligent/cdk-aspects": patch
---

Skip prefixing AWS-reserved log group names (e.g. `/aws/lambda/...`, `/aws/apigateway/...`). Previously, the `ResourcePrefixAspect` would incorrectly rename these log groups, causing deployment failures since AWS reserves the `/aws/` prefix for its own services. Also fixed base name resolution to check both PascalCase and camelCase CFN property keys.
