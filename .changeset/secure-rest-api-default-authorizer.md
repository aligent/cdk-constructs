---
"@aligent/cdk-secure-rest-api": major
---

BREAKING: Replace the API key and usage plan with a default Lambda token authorizer (`Authorization: Bearer`, token held in Secrets Manager) and stage-level throttling. Adds `authorizer`, `secret` and `authorizerCacheTtl` props and a per-route `authorizer` override (`AuthorizationType.NONE` makes a route public). Removes `apiKey`, `usagePlan`, `apiKeyName` and `usagePlanName`. CORS default headers are now `Content-Type` and `Authorization`. See the README migration guide.
