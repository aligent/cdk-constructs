---
"@aligent/cdk-aspects": patch
---

`ResourcePrefixAspect` no longer prefixes log groups named `aws-waf-logs-*`. WAF only delivers logs to a log group whose name starts with that prefix, so prefixing it broke the logging configuration of any WAF (e.g. `@aligent/cdk-waf` with logging on) in a stack using the aspect.
