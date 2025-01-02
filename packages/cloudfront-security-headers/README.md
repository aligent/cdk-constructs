# AWS CDK CloudFront Security Headers
![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/cloudfront-security-headers/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/cloudfront-security-headers/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-cloudfront-security-headers?color=green)

This package contains a Lambda@Edge function for Cloudfront to add security headers to the origin response of all requests.

The function is intended to be added to an existing Cloudfront. 

## Usage and Default Options
### `contentSecurityPolicy` (array&lt;string&gt;, optional)
- Array to store content security policies to attach

## Security headers attached
```
headers["strict-transport-security"]
headers["content-security-policy"]
headers["x-content-type-options"]
headers["x-frame-options"]
```