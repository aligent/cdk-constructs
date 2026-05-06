---
"@aligent/cdk-aspects": patch
---

Fix `DynamoDbDefaultsAspect` injecting `ProvisionedThroughput` onto `PAY_PER_REQUEST` tables and `OnDemandThroughput` onto `PROVISIONED` tables
