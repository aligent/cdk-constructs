---
"@aligent/cdk-waf": minor
---

Add rateLimitRules prop for additional rate-based rules, each aggregating on IP, CONSTANT or CUSTOM_KEYS, with an optional scope-down statement, evaluation window and action (block/count independently of activate). Rules take priorities 31+ after the legacy rateLimit rule (30), which is unchanged. Rule priorities and names are now checked for uniqueness at synth time. The README warns that X-Forwarded-For based rate limiting and IP rules are spoofable when an ALB faces the internet directly.