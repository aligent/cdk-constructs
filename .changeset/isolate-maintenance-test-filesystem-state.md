---
"@aligent/cdk-graphql-mesh-server": patch
---

Resolve MAINTENANCE_FILE_PATH lazily so the maintenance handler honours the runtime-configured path; fixes flaky maintenance handler tests via per-suite filesystem isolation.
