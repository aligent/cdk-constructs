---
"@aligent/cdk-waf": minor
---

Add `customResponse` to `rateLimitRules` entries: a blocking rate rule can return a custom status code (e.g. `429` instead of WAF's default `403`) and optional body, registered in the WebACL's `customResponseBodies` under the rule's name. Ignored while the rule only counts. WebACLs without custom responses are unchanged.
