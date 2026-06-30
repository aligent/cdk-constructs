---
"@aligent/cdk-secure-rest-api": minor
---

Support nested (multi-segment) route paths in the `routes` helper. Paths such as `rewards/accounts/{accountId}/redeem` now create the intermediate resources instead of throwing `ResourceSPathPartOnly` at synth time. Routes sharing a common prefix resolve idempotently.

Add a `deployOptions` prop (CDK `StageOptions`) so the deployed stage name and other stage settings can be configured. Defaults to the CDK `prod` stage when omitted.
