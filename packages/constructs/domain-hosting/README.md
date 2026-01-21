# Aligent AWS Domain Hosting

## Overview

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/domain-hosting/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/domain-hosting/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-domain-hosting?color=green)

A simple package used for creating and/or managing a hosted zone in AWS. Handy for setting up a cloudfront site from scratch when there's no existing domain management in place or integrating into an already existing setup.
You are able to use a domain that was requested through AWS Route53 or an external provider. 

It can be imported and used within CDK applications. By default this construct will create a hosted zone and a certificate to validate a domain against. Records are not created unless explicitly stated.

It has the following features that can optionally be enabled:

- Create custom records of `CNAME`, `A`, `AAAA`, `MX`, and `SRV` types
- Create a certificate for the specified domain (and any subdomains) 

## If using an external provider 
You will need to set the NS record in your provider's management page to the values in the hosted zone after you run `cdk deploy` as the certificate will not validate otherwise

## Installation

```bash
npm install @aligent/cdk-domain-hosting aws-cdk-lib constructs
```

Or with yarn:

```bash
yarn add @aligent/cdk-static-hosting aws-cdk-lib constructs
```

### Peer Dependencies

This package has peer dependencies on:
- `aws-cdk-lib` (^2.120.0)
- `constructs` (^10.0.0)

Make sure to install compatible versions of these packages in your CDK application.

## Usage

The following CDK snippet can be used to provision a zone with records and a certificate using this construct.

```
import { Construct } from "constructs";
import { Stack } from "aws-cdk-lib";
import { DomainHosting } from "@aligent/cdk-domain-hosting";
import { DomainHostingProps } from "../types";
import { RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

export class DomainHostingStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainHostingProps) {
    super(scope, id, props);

    new DomainHosting(this, "DomainHostingStack", {
      domainName: props.domainName,
      certificateSubDomains: ['www'],
      records: [
        {
          type: 'CNAME',
          name: 'www.example.com',
          value: props.distribution.distributionDomainName
        },
        {
          type: 'A',
          name: 'www.example.com',
          value: RecordTarget.fromAlias(new CloudFrontTarget(props.distribution))
        },
        {
          type: 'SRV',
          name: 'xmpp.example.com',
          value: [{ port: 443, priority: 1, hostName: 'xmpp-srv', weight: 10 }]
        },
        {
          type: 'MX',
          name: 'mail.example.com',
          value: [{ priority: 1, hostName: 'mymail' }]
        },
        {
          type: 'AAAA',
          name: 'www.example.com',
          value: RecordTarget.fromAlias(new CloudFrontTarget(props.distribution))
        },
      ]
    });
  }
}
```

The below one would be used if you already had a certificate or hosted zone and just wanted to control it with CDK

```
new DomainHosting(this, "DomainHostingStack", {
	domainName: props.domainName,
	hostedZoneId: 'Z0123ABC',
	certificateArn: 'arn:aws:acm:us-east-1:xyz',
})
```
### Little note
If you are using the StaticHostingStack you can get the CloudFront distribution value to pass as an Alias like so:

#### static-hosting-stack.ts
```
export class StaticHostingStack extends Stack {
  public readonly distribution: IDistribution; // create a class variable
  ...
  const hosting = new StaticHosting(this, "StaticHostingStack", {...}) // save it to a variable
  this.distribution  =  hosting.distribution // get the variable here
}
```

 #### application.ts
```
    const staticHosting = new StaticHostingStack(this, "StaticHostingStack", {
      ...
    }); // from static-hosting-stack.ts class

    const domainHosting = new DomainHostingStack(this, "DomainHostingStack", {
      ...props,
      distribution: staticHosting.distribution // pass in here 
    });
```
