# ESbuild
Esbuild is a module bundler and minifier for JavaScript and CSS.

## Overview
This repository provides a construct which runs the esbuild bundler for AWS through the ILocalBundling interface and allows AWS CDK's bundling process to use the esbuild tool to generate a bundled output

## Usage and Default esbuild options
### `loglevels` (string)
Options for the level of silence for esbuild warnings and/or error messages to the terminal

- **silent**: (no logs outputted)
- **error**: (only shows errors)
- **warning**: (show warnings and errors)
- **info**: (show warnings, errors and an output file summary)
- **debug**: (log everything from `info` and some additional messages that may help you debug a broken handler)

Default: **info**

### `sourcemap` (boolean)
Source maps encode the information necessary to translate from a line/column offset in a generate output file back to a line/column offset in the corresponding original input file. Supported for both Javascript and CSS

- **true (linked)**
(source map generated into seperate `.js.map` output file and `.js` contains special `//# sourceMappingURL =` comment that points to the `.js.map` output file)
- **external**
(source map generated into seperate `.js.map` output file and `.js` does not contain special `//# sourceMappingURL =` comment)
- **inline**
(source map appended to the end of the `.js` output file as a base64 payload inside a `//# sourceMappingURL =` comment. no `.js.map` file is generated)
- **both** 
(combination of `inline` and `external`. The source map is appended inline to the end of the .js output file, and another copy of the same source map is written to a separate .js.map output file alongside the .js output file)

Default: **true**

### `bundle` (boolean)
Inline any imported dependecies into the file itself. Process if recursive so dependecies of dependecies (and so on) will also be inline. **Must be explictly enable**

Default: **false**

### `minify` (booleans)
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

### `platform` (string)
Which platform esbuild's bundler will generate code for/

- **browser**
- **node**
- **neutral**

Default: **browser**

