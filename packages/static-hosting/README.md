# Aligent AWS Static Hosting

## Overview

This repository defines a CDK construct for hosting a static website on AWS using S3 and CloudFront. 
It can be imported and used within CDK applications.

## Example
The following CDK snippet can be used to provision a static hosting stack using this construct.

```
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { StaticHosting, StaticHostingProps } from '@aligent/cdk-static-hosting'
import { Construct, Stack, StackProps } from '@aws-cdk/core';


const HostingStackProps : StaticHostingProps = {
    subDomainName: 'sub.domain',
    domainName: 'domain.tld',
    certificateArn: 'arn:aws:acm:us-east-1:123456789:certificate/some-arn-id',
    createDnsRecord: false,
    createPublisherGroup: true,
    createPublisherUser: true,
    enableErrorConfig: true
};

class HostingStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        new StaticHosting(this, 'hosting-stack', HostingStackProps);
    }
}

const app = new cdk.App();

new HostingStack(app, 'hosting-stack', {
     env: {
          region: 'ap-southeast-2',
          account: 'account-id',
     }
});

```
