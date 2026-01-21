# ESbuild 
Esbuild is a module bundler and minifier for JavaScript/Typescript.

## Overview
This repository provides a construct which runs the esbuild bundler for AWS through the ILocalBundling interface and allows AWS CDK's bundling process to use the esbuild tool to generate a bundled output

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/esbuild/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/esbuild/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-esbuild?color=green)

Default options are set in [esbuild.ts](https://github.com/aligent/cdk-constructs/blob/main/packages/esbuild/esbuild.ts). Other options can be set when calling esbuild in your construct. The options listed below are some of the most common, and default options for esbuild. Remaining options can be found at [API - Esbuild](https://esbuild.github.io/api/)

## Usage and Default esbuild options
### `entryPoint` (array)
An array of files that each serve as an input to the bundling algorithm, for example:
```
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['home.ts', 'settings.ts'],
  bundle: true,
  write: true,
  outdir: 'out',
}) 
```
which would create two output files, `out/home.js` and `out/settings.js`.

More information can be found at [Entry points - Esbuild](https://esbuild.github.io/api/#entry-points:~:text=%23-,Entry%20points,-Supported%20by%3A)

### `define`
Provides a way to replace global identifiers with constant expressions. Can change behavior of code between builds, without changing the code itself, for example:

```
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

new Esbuild({
  entryPoints: [join(__dirname, "handlers/example.ts")],
  define: {
    "process.env.EXAMPLE_VAR": "\"exampleValue\"",
  },
});
```
where `process.env.EXAMPLE_VAR` is replaced with `exampleValue`

More information can be found at [Define - Esbuild](https://esbuild.github.io/api/#target:~:text=%23-,Define,-Supported%20by%3A)

### `loglevels` (string, default)
Options for the level of silence for esbuild warnings and/or error messages to the terminal

- **silent**: (no logs outputted)
- **error**: (only shows errors)
- **warning**: (show warnings and errors)
- **info**: (show warnings, errors and an output file summary)
- **debug**: (log everything from `info` and some additional messages that may help you debug a broken handler)

Default: **info**

### `sourcemap` (boolean, default)
Source maps encode the information necessary to translate from a line/column offset in a generate output file back to a line/column offset in the corresponding original input file. Supported for both Javascript/Typescript.

- **true (linked)**
(source map generated into seperate `.js.map` output file and `.js` contains special `//# sourceMappingURL =` comment that points to the `.js.map` output file)
- **external**
(source map generated into seperate `.js.map` output file and `.js` does not contain special `//# sourceMappingURL =` comment)
- **inline**
(source map appended to the end of the `.js` output file as a base64 payload inside a `//# sourceMappingURL =` comment. no `.js.map` file is generated)
- **both** 
(combination of `inline` and `external`. The source map is appended inline to the end of the .js output file, and another copy of the same source map is written to a separate .js.map output file alongside the .js output file)

Default: **true**

### `bundle` (boolean, default)
Inline any imported dependecies into the file itself. Process if recursive so dependecies of dependecies (and so on) will also be inline. **Must be explictly enable**

Default: **false**

### `minify` (booleans, default)
Generated code will be minified instead of pretty-printed. Downloads faster, but harder to debug. Use minified codes in production but not in development.

Default: **false**

`minify` can be broken down into: 
- `minifyWhitespace` (boolean)
  - Default: **true**
- `minifyIdentifiers` (boolean)
  - Do not _minify_ identifiers. Exported 'handler' function name gets minified failing to start the lambda
  - Default: **false**
- `minifySyntax` (boolean)
  - Default: **true**

### `platform` (string, default)
Which platform esbuild's bundler will generate code for/

- **browser**
- **node**
- **neutral**

Default: **browser**

## Implementation Example
Derived from [GeoIP Redirect Construct CDK](https://github.com/aligent/cdk-constructs/blob/main/packages/geoip-redirect/lib/redirect-construct.ts)
```
import { join } from "path";
import { AssetHashType, DockerImage } from "aws-cdk-lib";
import { Code, Runtime, Version } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Esbuild } from "@aligent/cdk-esbuild";

export class ExampleFunction extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new Code(this, "example-function", {
      code: Code.fromAsset(join(__dirname, "handlers"), {
        assetHashType: AssetHashType.OUTPUT,
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "handlers/example.ts")],
            define: {
              "process.env.EXAMPLE_VAR": "exampleValue",
            },
          }),
        },
      }),
      runtime: Runtime.NODEJS_22_X,
      handler: "example.handler",
    });
  }

  public getFunctionVersion(): Version {
    return Version.fromVersionArn(
      this,
      "example-function-version",
      this.exampleFunction.currentVersion.versionArn
    );
  }
}
```

