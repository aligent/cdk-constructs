# Aligent AWS Secure REST API

## Overview

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/secure-rest-api/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/secure-rest-api/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-secure-rest-api?color=green)

A CDK construct for provisioning an API Gateway REST API protected by a default Lambda token authorizer, with stage-level throttling. Routes accept any CDK `Integration`, giving callers full control over how endpoints are wired.

> [!WARNING]
> The API key and usage plan have been removed. An API key is a single shared secret for usage plans, not an authentication mechanism. Every route is now protected by an authorizer: the default Lambda token authorizer unless you supply your own. See [Migrating from the API key version](#migrating-from-the-api-key-version).

## Features

- API Gateway REST API protected by a default Lambda token authorizer (`Authorization: Bearer <token>`) on all routes
- Token held in Secrets Manager, generated on first deploy and rotated with a single secret write, no redeploy
- Bring your own authorizer (Cognito, custom Lambda)
- Per-route authorizer override, including an explicit fully public route
- Stage-level throttling with configurable rate and burst limits
- Configurable CORS preflight options
- Accepts any CDK `Integration` per route (Lambda, HTTP, Mock, Step Functions, etc.)
- Supports nested, multi-segment route paths (e.g. `rewards/accounts/{accountId}/redeem`)
- Supports alias paths so a route can be exposed under an additional path (e.g. renaming an endpoint without breaking existing consumers)
- Configurable deployment stage via `deployOptions` (stage name defaults to `prod`)
- Optional IP allowlist via `allowedIps`, enforced with an API Gateway resource policy

## Security Model

- The default token is a **bearer secret**, not per-caller identity. Anyone holding it can call the API, and every caller shares the same token. Use a custom `authorizer` if you need per-caller identity.
- Only the current secret version is accepted. The previous token stops working once you rotate, after at most the authorizer cache TTL.
- A missing or malformed `Authorization` header (including a non-`Bearer` scheme) returns `401`. A well-formed but non-matching token returns `403`. If the authorizer cannot read the secret it fails closed with an error response rather than allowing the request.
- CORS preflight (`OPTIONS`) requests are never authorized, as browsers do not send credentials on preflight.
- `allowedIps` is defence in depth and applies **together with** the authorizer: a caller must come from an allowed IP and present a valid token.
- Routes with `authorizer: AuthorizationType.NONE` are **fully public**. Neither the authorizer nor any token gates them.

## Installation

```bash
npm install @aligent/cdk-secure-rest-api
```

Or with yarn:

```bash
yarn add @aligent/cdk-secure-rest-api aws-cdk-lib constructs
```

### Peer Dependencies

- `aws-cdk-lib` (^2.224.0, needed for the Node.js 24 runtime of the default authorizer)
- `constructs` (^10.5.0)

## Basic Usage

```typescript
import { SecureRestApi } from '@aligent/cdk-secure-rest-api';
import { LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';

const secureApi = new SecureRestApi(this, 'Api', {
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
const { api, secret } = secureApi;
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

### Nested route paths

Multi-segment paths create the intermediate resources automatically. Routes
sharing a common prefix resolve to the same parent resource.

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'rewards-api',
  routes: [
    {
      path: 'rewards/accounts/{accountId}/redeem',
      methods: [HttpMethod.POST],
      integration: new LambdaIntegration(redeemFunction),
    },
    {
      path: 'rewards/reversal', // reuses the shared `rewards` resource
      methods: [HttpMethod.POST],
      integration: new LambdaIntegration(reversalFunction),
    },
  ],
});
```

### Alias paths

Expose a route under one or more additional paths, useful when renaming an
endpoint without breaking existing consumers: keep the old path as an alias
until callers migrate to the new one, then drop `aliasPaths` once it's safe.

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  routes: [
    {
      path: 'customers',
      methods: [HttpMethod.GET],
      integration: new LambdaIntegration(customersFunction),
      aliasPaths: ['people'], // old path, kept working during migration
    },
  ],
});
```

Alias paths work with nested routes too, as long as the parameter names match:

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  routes: [
    {
      path: 'customers/{id}/addresses',
      methods: [HttpMethod.GET],
      integration: new LambdaIntegration(addressesFunction),
      aliasPaths: ['people/{id}/addresses'],
    },
  ],
});
```

### Calling the API

```bash
curl -H "Authorization: Bearer $TOKEN" https://<api-id>.execute-api.<region>.amazonaws.com/prod/items
```

The generated token is the plain-string value of `secureApi.secret`. Fetch it with:

```bash
aws secretsmanager get-secret-value --secret-id <secret-arn> --query SecretString --output text
```

### Bring your own authorizer

When `authorizer` is set, the construct creates no authorizer Lambda or secret, and `secureApi.secret` is `undefined`.

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  authorizer: new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
    cognitoUserPools: [userPool],
  }),
  routes: [...],
});
```

### Per-route authorizer and public routes

A route's `authorizer` overrides the API-level one for that route and its alias paths. `AuthorizationType.NONE` makes the route fully public, so use it only for routes that verify callers another way (e.g. health checks or signature-verified webhooks).

```typescript
import { AuthorizationType } from 'aws-cdk-lib/aws-apigateway';

const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  routes: [
    { path: 'items', methods: [HttpMethod.GET], integration: itemsIntegration },
    {
      path: 'health',
      methods: [HttpMethod.GET],
      integration: healthIntegration,
      authorizer: AuthorizationType.NONE, // fully public
    },
    {
      path: 'admin',
      methods: [HttpMethod.GET],
      integration: adminIntegration,
      authorizer: adminAuthorizer, // different authorizer for this route
    },
  ],
});
```

### Customising the default authorizer

The default authorizer Lambda runs with 256 MB of memory, a 5 second timeout and active X-Ray tracing, so it satisfies `MicroserviceChecks` without extra configuration.

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  authorizerCacheTtl: Duration.seconds(30), // default is 60 seconds
  routes: [...],
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

### Custom stage name

By default the API deploys to a `prod` stage. Pass `deployOptions` to override
the stage name (or any other CDK `StageOptions`, e.g. logging or tracing).

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  deployOptions: { stageName: 'staging' },
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
    additionalHeaders: ['X-Custom'],        // appended to Content-Type, Authorization
  },
  routes: [...],
});
```

### IP allowlist

```typescript
const api = new SecureRestApi(this, 'Api', {
  apiName: 'my-api',
  allowedIps: ['203.0.113.0/24', '198.51.100.7', '2001:db8::/32'],
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
| `path` | `string` | The resource path; may be nested/multi-segment (leading slash is stripped automatically) |
| `methods` | `HttpMethod[]` | HTTP methods to register on the resource |
| `integration` | `Integration` | Any CDK API Gateway integration |
| `aliasPaths` | `string[]` | Optional. Additional paths that register the same `methods` and `integration` |
| `authorizer` | `IAuthorizer \| AuthorizationType.NONE` | Optional. Overrides the API-level authorizer for this route and its aliases. `AuthorizationType.NONE` makes the route fully public. Default: the API-level authorizer |

### `authorizer` (IAuthorizer)

Authorizer applied to every route, replacing the default token authorizer. When set, no authorizer Lambda or secret is created and `secret` is `undefined`. IAM (SigV4) authorization is not supported.

Default: a Lambda TOKEN authorizer validating a bearer token held in a generated secret.

### `authorizerCacheTtl` (Duration)

How long API Gateway caches the default authorizer's decision for a token. A revoked token can remain valid for up to this long. Cannot be combined with a custom `authorizer`; doing so throws at synth.

Default: 60 seconds.

### `deployOptions` (StageOptions)

Stage options for the API's default deployment, passed through to the underlying
CDK `RestApi`. Use `stageName` to override the deployed stage name.

Default: CDK default (`prod` stage).

### `throttle` (object)

Stage-level throttling limits applied to every method.

| Property | Type | Default |
|----------|------|---------|
| `rateLimit` | `number` | `100` |
| `burstLimit` | `number` | `200` |

`throttlingRateLimit` / `throttlingBurstLimit` set explicitly in `deployOptions` take precedence over the matching value here.

### `corsOptions` (object)

CORS preflight configuration applied to all resources.

| Property | Type | Behaviour |
|----------|------|-----------|
| `allowOrigins` | `string[]` | Overrides the default (all origins) |
| `additionalMethods` | `string[]` | Appended to the defaults: `GET`, `OPTIONS` |
| `additionalHeaders` | `string[]` | Appended to the defaults: `Content-Type`, `Authorization` |

### `allowedIps` (string[])

IPv4/IPv6 addresses or CIDR ranges allowed to invoke the API. Enforced with an API Gateway resource policy that allows `execute-api:Invoke` and denies any source IP not in the list.

- Applies to every request, including CORS preflight (`OPTIONS`), so browsers calling from an IP outside the list will see a blocked preflight rather than a readable 403.
- Entries are validated at synth; an empty array or any malformed entry throws an error naming the offending values.
- `0.0.0.0/0` and `::/0` are accepted but disable the restriction.
- The authorizer still applies to allowed callers: the allowlist adds a network check, it does not replace token validation.
- Public routes (`authorizer: AuthorizationType.NONE`) are still subject to the allowlist.

Default: no IP restriction.

## Rotation and Emergency Revoke

Rotating the token is a single Secrets Manager write. No deploy is needed, and CDK redeploys never change a live secret value.

```bash
aws secretsmanager put-secret-value \
  --secret-id <secret-arn> \
  --secret-string "$(openssl rand -hex 32)"
```

- The authorizer reads the current secret version on every invocation, and API Gateway caches decisions per token, so the new token is accepted as soon as the write lands. A token that was presented and denied before the write can stay denied for up to `authorizerCacheTtl`, so do not test the new token before rotating.
- The old token is rejected once its cached decision expires, which is at most `authorizerCacheTtl` (default 60 seconds) after the write.
- Only one token is valid at a time. There is no grace window, so share the new token with callers before or immediately after rotating.
- **Emergency revoke** is the same single command. Tell the incident channel the old token dies within the cache TTL, or lower `authorizerCacheTtl` ahead of time if you need faster revocation.

### Token requirements

The generated token is 64 random alphanumeric characters. Any value you write during rotation must meet the same bar, because the authorizer fails closed with an error response on a secret shorter than 32 characters.

- Generate it with a cryptographically secure pseudo-random number generator (CSPRNG), such as `openssl rand`. Never write one by hand or derive it from something guessable.
- Use at least 128 bits of entropy. 32 hex characters is exactly 128 bits, and printable ASCII needs 20 characters, so the enforced minimum of 32 characters is safe for any encoding.
- Store it as a plain string, not JSON.

## Migrating from the API key version

This is a breaking change.

| Before | After |
|--------|-------|
| `x-api-key: <key>` header | `Authorization: Bearer <token>` header |
| API key and usage plan created | Removed. Throttling uses stage-level throttling with the same `throttle` defaults (100 rps / 200 burst) |
| `apiKey` and `usagePlan` readonly fields | Removed. Use `secret` to read the generated token |
| `apiKeyName` and `usagePlanName` props | Removed |
| CORS default headers `Content-Type`, `X-Api-Key` | `Content-Type`, `Authorization` |

Migration steps:

1. Upgrade and remove `apiKeyName` / `usagePlanName` from your props, and any use of `apiKey` / `usagePlan` on the construct.
2. Deploy. A secret and authorizer Lambda are created, and every route now requires a bearer token.
3. Give callers the token from `secureApi.secret` and switch them from `x-api-key` to `Authorization: Bearer <token>`.
4. Update any CORS `additionalHeaders` that only existed to allow `Authorization`.
5. Any route that must stay open now needs an explicit `authorizer: AuthorizationType.NONE`.

Callers still sending `x-api-key` are rejected with `401` once the deploy completes, so coordinate the switch with your consumers.

## Local Development

[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally:

1. Pull this repository locally
2. `cd` into this repository
3. Run `npm link`
4. `cd` into the downstream repo and run `npm link '@aligent/cdk-secure-rest-api'`

The downstream repository should now include a symlink to this module, allowing local changes to be tested before pushing.
