---
"@aligent/cdk-aspects": minor
---

`MicroserviceChecks` now requires descriptions:

- `Microservices-ResourceDescription`: Lambda functions, API Gateway REST/HTTP APIs, EventBridge rules/schedules/pipes, SSM parameters, Secrets Manager secrets and KMS keys need a non-blank `description`. S3 buckets, DynamoDB tables (v1 `Table`), SQS queues and SNS topics need a `Description` tag. Step Functions state machines need a top-level ASL `Comment`. File-based definitions (`DefinitionBody.fromFile`, `@aligent/cdk-step-function-from-file`) can't be checked at synth time and must be suppressed.
- `Microservices-StackDescription`: stacks (incl. nested stacks) need a `description`.

**Heads up:**

- Both are ERRORs by default, so `cdk synth` fails until descriptions are added or the rules are suppressed (`NagSuppressions.addResourceSuppressions` / `addStackSuppressions`). Set `resourceDescriptionLevel: NagMessageLevel.WARN` to report the resource rule as a warning while you adopt it.
- The API Gateway stage-name rule ID changed from `Microservices-` to `Microservices-ApiGatewayStageName`. Update existing suppressions.
- Add `MicroserviceChecks` with `{ priority: AspectPriority.READONLY }` so tags added via `Tags.of(...)` are visible to the checks.
