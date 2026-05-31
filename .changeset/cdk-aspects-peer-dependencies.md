---
"@aligent/cdk-aspects": patch
---

Move `aws-cdk-lib` and `constructs` from `dependencies` to `peerDependencies`, matching the convention used by every `@aligent/cdk-*` construct package.

As regular dependencies, a consumer whose own `aws-cdk-lib` resolved to a different version ended up with two copies in the tree. The aspects' `instanceof CfnResource` checks compared against the nested copy's class, so `visit()` returned early for every node — aspects silently became a no-op (no prefixes, no defaults, no checks) with a valid-but-untouched synth. Declaring them as peers guarantees a single shared instance with the consumer.
