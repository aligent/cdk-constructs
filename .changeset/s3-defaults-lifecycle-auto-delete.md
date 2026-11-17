---
"@aligent/cdk-aspects": minor
---

Fix two `S3DefaultsAspect` bugs:

- SHORT/MEDIUM expiry (30/90 days) was never added to L2 `Bucket`s: the guard checked the raw lazy `lifecycleConfiguration`, which is never `undefined`. It now checks the resolved value.
- Synth no longer throws "There is already a Construct with name 'AutoDeleteObjectsCustomResource'" for buckets that already set `autoDeleteObjects: true`.
- Buckets that set `autoDeleteObjects: true` themselves now keep their `DESTROY` removal policy under LONG. Previously the aspect forced RETAIN, so the bucket was kept on stack deletion but its objects were still emptied by the auto-delete custom resource.

**Heads up:** SHORT/MEDIUM buckets without their own `lifecycleRules` have had no expiry until now. After this release, objects older than 30/90 days are deleted on the next deploy. To opt a bucket out, give it a rule that does not expire current objects, e.g. `lifecycleRules: [{ abortIncompleteMultipartUploadAfter: Duration.days(7) }]`.
