---
"@aligent/cdk-secure-rest-api": major
---

BREAKING: Replace the API key and usage plan with a default Lambda token authorizer (`Authorization: Bearer`, token held in a generated Secrets Manager secret) and stage-level throttling. Adds `authorizer` and `authorizerCacheTtl` props and a per-route `authorizer` override (`AuthorizationType.NONE` makes a route public). Removes `apiKey`, `usagePlan`, `apiKeyName` and `usagePlanName`. CORS default headers are now `Content-Type` and `Authorization`. The authorizer runs on Node.js 24, so the `aws-cdk-lib` peer dependency is now `^2.224.0`. See the README migration guide.
