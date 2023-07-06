# Aligent AWS WAF

## Overview

This repository defines a CDK construct for provisioning an AWS Web Application Firewall (WAF) stack. It can be imported and used within CDK application.
##Example
The following CDK snippet can be used to provision the an AWS WAF stack.

```
import 'source-map-support/register';
const cdk = require('@aws-cdk/core');
import { WebApplicationFirewall } from '@aligent/cdk-waf';
import { Stack } from '@aws-cdk/core';


import { Environment } from '@aws-cdk/core'
import { env } from 'node:process';

const preprodEnv: Environment = {account: '<TargetAccountId-Preprod>', region: '<TargetAccountRegion-Preprod>'};

const target = '<TargetAccountIdentifier>';
const appName = 'WAF';

const defaultAllowedIPv4s = [
     'a.a.a.a/32', 'b.b.b.b/32',     // Offices
     'c.c.c.c/32', 'd.d.d.d/32',     // Payment Gateways
]

const defaultAllowedIPv6s = [
     '1234:abcd:5678:ef01::/56',     // Offices
     '1234:ef01:5678:abcd::/56',     // Security Scanner
]

export const preProductionWafStackProps = {
env: preprodEnv,
     activate: true,  // Update this line with either true or false, defining Block mode or Count-only mode, respectively.  
     allowedIPs: defaultAllowedIPs.concat([
               'y.y.y.y/32' // AWS NAT GW of preprod vpc
               // environment-specific comma-separated allow-list comes here
     ]),
     allowedUserAgents: [],  // Allowed User-Agent list that would have been blocked by AWS BadBot rule. Case-sensitive. Optional.
     excludedAwsRules: [],   // The rule to exclude (override) from AWS-managed RuleSet. Optional.
     associatedLoadBalancerArn: '<ArnOfPreproductionFrontendALB>',
     wafName: <NAME>
}

class WAFStack extends Stack {
  constructor(scope: Construct, id: string, props: preprodEnv) {
    super(scope, id, props);

    new WebApplicationFirewall(scope, 'waf-stack', prod);
  }
}

new WAFStack(scope, envName, preProductionWafStackProps);
```

## Monitor and activate
By default, WebACL this stack creates will work in COUNT mode to begin with.After a certain period of monitoring under real traffic and load, apply necessary changes, e.g. IP allow_list or rate limit, to avoid service interruptions before switching to BLOCK mode.

## Local development
[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally.
1. Pull this repository locally
2. `cd` into this repository
3. run `npm link`
4. `cd` into the downstream repo (target project, etc) and run `npm link '@aligent/cdk-waf'`
The downstream repository should now include a symlink to this module. Allowing local changes to be tested before pushing. You may want to update the version notation of the package in the downstream repository's `package.json`.

