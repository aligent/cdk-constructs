---
"@aligent/cdk-aspects": minor
---

`DynamoDbDefaultsAspect` now treats profile throughput as a default rather than an override. Read/write throughput explicitly set on a `Table` construct is respected instead of being clobbered by the profile, so a high-throughput table can lift the MEDIUM on-demand cap (or set its own provisioned capacity) via normal construct props.
