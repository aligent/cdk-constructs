# AligentShared VPC

## Overview

This repository creates a stack that provides a stable elastic IP for micro-services. Micro-services are then deployed into this VPC rather than creating their own. A hosted zone is also created to allow for private DNS configuration.

## Example

The following can be used to provision a shared VPC.

```
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { SharedVpc, SharedVpcProps, Zone } from '@aligent/cdk-shared-vpc';

const hostedZones: Zone[] = [
    { type: "A", target: "10.6.0.12", record: "subdomain" }
]
const sharedVpcProps : SharedVpcProps = {
    vpcName: 'my-vpc-name',
    cidr: '10.0.0.0/16',
    hostedZoneDomain: 'example.com',
    hostedZoneRecords: hostedZones
};

class MyStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);
        new SharedVpc(this, 'my-shared-vpc', sharedVpcProps);
    }
}

const app = new cdk.App();
new MyStack(app, 'my-stack');
```