---
"@aligent/cdk-static-hosting": patch
---

Replaced deprecated `S3Origin` with `S3BucketOrigin.withOriginAccessIdentity` to silence the `aws-cdk-lib.aws_cloudfront_origins.S3Origin is deprecated` warning. No behavioural change — the same OAI is still used.
