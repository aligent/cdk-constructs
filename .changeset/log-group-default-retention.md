---
"@aligent/cdk-aspects": minor
---

Fix `LogGroupDefaultsAspect` never applying profile retention to L2 `LogGroup`s. CDK renders an omitted `retention` as `TWO_YEARS`, so the old `=== undefined` guard skipped every L2 without explicit retention and instead overrode those that set `RetentionDays.INFINITE`.

- L2 `LogGroup`s with no `retention` now get the profile retention (SHORT: 1 week, MEDIUM: 6 months, LONG: 2 years).
- An explicit `RetentionDays.INFINITE` is now respected. If you used `INFINITE` to opt into the aspect, remove it, or those logs will be kept forever.
- An explicit `RetentionDays.TWO_YEARS` is overridden by the profile, since it is indistinguishable from the CDK default.
