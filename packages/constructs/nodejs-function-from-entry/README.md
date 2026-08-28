# Aligent AWS NodejsFunction From Entry

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/nodejs-function-from-entry/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/nodejs-function-from-entry/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fnodejs-function-from-entry?color=green)

A `Function` wrapper that resolves a source `entry` path to a pre-bundled code asset.

Given an entry like `runtime/handlers/fetch-data.ts`, the source prefix and `.ts` extension are stripped, and the dist prefix is prepended to locate the bundled output directory.

The `entry` prop is type-checked with a configurable prefix (defaults to `runtime/handlers/`), ensuring handler paths follow a consistent convention.

## Usage

```typescript
import { NodejsFunctionFromEntry } from "@aligent/nodejs-function-from-entry";

// Basic usage (entry must start with 'runtime/handlers/' by default)
// Resolves to: Code.fromAsset(path.resolve(baseDir, '../dist/fetch-data'))
new NodejsFunctionFromEntry(this, "FetchData", {
  entry: "runtime/handlers/fetch-data.ts",
  baseDir: import.meta.dirname,
});

// With custom prefix and dist path
new NodejsFunctionFromEntry<"src/handlers/">(this, "FetchData", {
  entry: "src/handlers/fetch-data.ts",
  baseDir: import.meta.dirname,
  sourcePrefix: "src/handlers/",
  distPrefix: "../build/",
});

// Overriding the handler (e.g. for a Lambda Layer wrapper that requires
// a fixed handler string, with the real handler passed via env var)
new NodejsFunctionFromEntry(this, "FetchData", {
  entry: "runtime/handlers/fetch-data.ts",
  baseDir: import.meta.dirname,
  handler: "newrelic-lambda-wrapper.handler",
  environment: {
    NEW_RELIC_LAMBDA_HANDLER: "index.handler",
  },
});
```
