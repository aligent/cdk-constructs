---
"@aligent/cdk-aspects": patch
---

Declare `cdk-nag` (`^2.38.2`) as a peer dependency. `MicroserviceChecks` requires it at load time, so consumers without their own `cdk-nag` got "Cannot find module 'cdk-nag'". cdk-nag v3 is not supported: its packs are `Validations` plugins, so `MicroserviceChecks` reports nothing under v3.
