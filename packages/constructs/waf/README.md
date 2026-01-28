# Aligent AWS WAF

## Overview

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/waf/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/waf/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-waf?color=green)

This repository defines a CDK construct for provisioning an AWS Web Application Firewall (WAF) stack. It can be imported and used within CDK applications.

## Features

- IP allowlisting and blocklisting (IPv4 and IPv6)
- Path-based allowlisting
- User-Agent allowlisting
- Rate limiting with configurable aggregation
- AWS Managed Rule Groups:
  - Known Bad Inputs (always enabled)
  - Common Rule Set (always enabled)
  - PHP Rules (optional, enabled by default)
  - IP Reputation List (optional)
  - Anonymous IP List (optional)
  - SQL Injection Protection (optional)
  - Bot Control (optional, additional costs apply)
- CloudWatch logging with configurable retention
- Support for both REGIONAL and CLOUDFRONT scopes
- Custom rule injection (pre and post processing)

## Installation

```bash
npm install @aligent/cdk-waf
```

## Basic Usage

```typescript
import { WebApplicationFirewall, REGIONAL, CLOUDFRONT } from '@aligent/cdk-waf';

// Minimal configuration
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'my-application-waf',
});

// Access the WebACL ARN for use with other resources
const webAclArn = waf.webAclArn;
```

## Configuration Examples

### PHP Application (Default behavior)

```typescript
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'php-waf',
  activate: true,
  allowedIPs: [
    '10.0.0.0/8',     // Internal network
    '203.0.113.0/24', // Office IPs
  ],
  rateLimit: 2000,
});
```

### Non-PHP Application (Node.js, Python, etc.)

```typescript
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'nodejs-api-waf',
  activate: true,
  enablePhpRules: false,        // Disable PHP-specific rules
  enableSqlInjection: true,     // Enable SQL injection protection
  rateLimit: 1000,
  rateLimitAggregation: 'IP',   // Use source IP instead of X-Forwarded-For
});
```

### High-Security Configuration

```typescript
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'secure-waf',
  activate: true,
  blockedIPs: ['192.0.2.0/24'],           // Block known bad actors
  blockedIPv6s: ['2001:db8:bad::/48'],
  allowedIPs: ['10.0.0.0/8'],
  enablePhpRules: false,
  enableIpReputationList: true,           // Block IPs with poor reputation
  enableAnonymousIpList: true,            // Block VPNs, proxies, Tor
  enableSqlInjection: true,
  enableBotControl: true,                  // Note: Additional costs apply
  rateLimit: 500,
});
```

### CloudFront Distribution WAF

```typescript
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'cloudfront-waf',
  scope: CLOUDFRONT,  // Must be deployed in us-east-1
  activate: true,
  rateLimit: 5000,
});

// Use with CloudFront
new cloudfront.Distribution(this, 'Distribution', {
  webAclId: waf.webAclArn,
  // ... other config
});
```

### ALB Association

```typescript
const waf = new WebApplicationFirewall(this, 'WAF', {
  wafName: 'alb-waf',
  scope: REGIONAL,
  activate: true,
  associations: [alb.loadBalancerArn],
  rateLimit: 1000,
});
```

## Rule Priority Structure

| Priority | Rule | Description |
|----------|------|-------------|
| 1-2 | IPv4 Blocklist | Block by X-Forwarded-For and source IP |
| 3-4 | IPv6 Blocklist | Block by X-Forwarded-For and source IP |
| 5-9 | Pre-process custom rules | User-defined rules |
| 10-15 | Allowlists | Path, IP, and User-Agent allowlists |
| 20 | Bad Actors | AWS Known Bad Inputs |
| 21 | Common Rules | AWS Common Rule Set |
| 22 | PHP Rules | AWS PHP Rule Set (optional) |
| 23 | IP Reputation | AWS IP Reputation List (optional) |
| 24 | Anonymous IP | AWS Anonymous IP List (optional) |
| 25 | SQL Injection | AWS SQLi Rule Set (optional) |
| 26 | Bot Control | AWS Bot Control (optional) |
| 30 | Rate Limiting | Rate-based blocking |
| 30+ | Post-process custom rules | User-defined rules |

## Monitor and Activate

By default, the WebACL works in COUNT mode. After monitoring under real traffic:
1. Review CloudWatch logs for blocked requests
2. Add necessary IP allowlists or excluded rules
3. Set `activate: true` to enable blocking mode

## Local Development

[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally:

1. Pull this repository locally
2. `cd` into this repository
3. Run `npm link`
4. `cd` into the downstream repo and run `npm link '@aligent/cdk-waf'`
The downstream repository should now include a symlink to this module. Allowing local changes to be tested before pushing. You may want to update the version notation of the package in the downstream repository's `package.json`.