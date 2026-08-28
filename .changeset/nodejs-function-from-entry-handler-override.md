---
"@aligent/cdk-nodejs-function-from-entry": minor
---

Allow overriding the resolved Lambda `handler`, needed for handler-wrapping mechanisms (e.g. a Lambda Layer wrapper) that require a fixed handler string. Existing callers are unaffected — omitting `handler` still defaults to the resolved `index.handler`.
