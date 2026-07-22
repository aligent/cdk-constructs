---
"@aligent/cdk-prerender-fargate": minor
---

Add a configurable `recacheDelay` to `prerenderFargateRecachingOptions`. This controls the delay between purging the cached object from S3 and the recache consumer fetching the URL to re-render it, allowing frontend cache (e.g. CloudFront or Fastly) invalidations to propagate first and avoiding a race condition where stale upstream content is re-cached. Backed by the SQS message delay (max 15 minutes); defaults to 1 second, preserving existing behaviour.
