# Aligent AWS Secure REST API

## Overview

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/secure-rest-api/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/secure-rest-api/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-secure-rest-api?color=green)

A CDK construct for provisioning an API Gateway REST API secured with API Key authentication and usage plan throttling. Routes accept any CDK `Integration`, giving callers full control over how endpoints are wired.

## Features

- API Gateway REST API with API Key authentication (`apiKeyRequired: true` on all routes)
- Usage plan with configurable throttle rate and burst limits
- Configurable CORS preflight options
- Accepts any CDK `Integration` per route (Lambda, HTTP, Mock, Step Functions, etc.)

## Installation

```bash
npm install @aligent/cdk-secure-rest-api
```

Or with yarn:

```bash
yarn add @aligent/cdk-secure-rest-api aws-cdk-lib constructs
```

### Peer Dependencies

- `aws-cdk-lib` (^2.113.0)
- `constructs` (^10.5.0)

## Basic Usage

```typescript
import { SecureRestApi } from '@aligent/cdk-secure-rest-api';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';

const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  routes: [
    {
      path: 'items',
      methods: [HttpMethod.GET],
      integration: new LambdaIntegration(myFunction),
    },
  ],
});

// Access created resources
const { api, apiKey, usagePlan } = api;
```

## Configuration Examples

### Multiple routes and methods

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  routes: [
    {
      path: 'items',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new LambdaIntegration(itemsFunction),
    },
    {
      path: 'orders',
      methods: [HttpMethod.GET],
      integration: new LambdaIntegration(ordersFunction),
    },
  ],
});
```

### Custom throttling

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  throttle: {
    rateLimit: 50,   // requests per second
    burstLimit: 100,
  },
  routes: [...],
});
```

### Custom CORS configuration

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  corsOptions: {
    allowOrigins: ['https://example.com'],  // overrides default (all origins)
    additionalMethods: ['POST'],            // appended to GET, OPTIONS
    additionalHeaders: ['Authorization'],   // appended to Content-Type, X-Api-Key
  },
  routes: [...],
});
```

## Configuration Reference

### `apiName` (string) — required

The name of the REST API and the base for generated resource names.

### `description` (string)

Description for the API Gateway REST API.

Default: `REST API for {apiName} service`

### `routes` (SecureRestApiRoute[]) — required

Routes to register on the API. Each route requires:

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | The resource path (leading slash is stripped automatically) |
| `methods` | `HttpMethod[]` | HTTP methods to register on the resource |
| `integration` | `Integration` | Any CDK API Gateway integration |

### `throttle` (object)

Throttling limits applied to the usage plan.

| Property | Type | Default |
|----------|------|---------|
| `rateLimit` | `number` | `100` |
| `burstLimit` | `number` | `200` |

### `corsOptions` (object)

CORS preflight configuration applied to all resources.

| Property | Type | Behaviour |
|----------|------|-----------|
| `allowOrigins` | `string[]` | Overrides the default (all origins) |
| `additionalMethods` | `string[]` | Appended to the defaults: `GET`, `OPTIONS` |
| `additionalHeaders` | `string[]` | Appended to the defaults: `Content-Type`, `X-Api-Key` |

### `apiKeyName` (string)

Override the name of the generated API key.

Default: `{apiName}-api-key`

### `usagePlanName` (string)

Override the name of the generated usage plan.

Default: `{apiName}-usage-plan`

## Local Development

[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally:

1. Pull this repository locally
2. `cd` into this repository
3. Run `npm link`
4. `cd` into the downstream repo and run `npm link '@aligent/cdk-secure-rest-api'`

The downstream repository should now include a symlink to this module, allowing local changes to be tested before pushing.
