# Aligent CloudFront Authentication

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/basic-auth/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/basic-auth/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-basic-auth?color=green)

- Enforces Basic Authentication for CloudFront requests.
- Simplified deployment using the `BasicAuthFunction` construct.
- For usage in CDK projects or alongside Aligent CDK-Constructs

## Components

1.  **Lambda@Edge Handler**: Implements the Basic Authentication logic.
2.  **`BasicAuthFunction` Construct**: A CDK construct for deploying the handler as a Lambda@Edge function.

---

### Installation

Add the package to your CDK project:
`npm install @aligent/cdk-basic-auth`

### Example Usage

```typescript
...
import { BasicAuthFunction, BasicAuthFunctionOptions } from 'your-package-name';
...

export class StaticHostingStack extends Stack {
  constructor(scope: Construct, id: string, props: StaticHostingProps) {
    super(scope, id, props);
    const basicAuthFunction = new BasicAuthFunction(this, 'MyBasicAuthFunction', { username: 'testuser', password: 'password' });
    const defaultBehaviorEdgeLambdas: EdgeLambda[] = [];
      defaultBehaviorEdgeLambdas.push(
        {
          eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
          functionVersion: basicAuthFunction.edgeFunction.currentVersion
        }
      );
    }
...
```

This is a basic non-functional implementation. See [StaticHosting/README.md](https://github.com/aligent/cdk-constructs/blob/main/packages/static-hosting/README.md) to cover full usage.

## Error Handling

- **Invalid Credentials**: Responds with `401 Unauthorized`.
- **Missing Credentials**: Responds with `401 Unauthorized` and prompts for Basic Authentication.
