# Geo-IP Redirect 

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/geoip-redirect/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/geoip-redirect/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-geoip-redirect?color=green)

This library provides a construct which creates a Lambda@Edge functions to perform GeoIP redirects.

These functions are intended to be added to an existing Cloudfront distribution. The Lambda@Edge function is triggered by a Viewer or Origin Request from Cloudfront, the function is passed the CloudFrontRequestEvent.

The Lambda@Edge function will check if the viewer's country code matches any supported regions:
- if they do, they are redirected to `${redirectURL}${countryCode.toLowerCase()}${request.uri}`
- if they do not, they are redirected to `${redirectURL}${DEFAULT_REGION.toLowerCase()}${
        request.uri
      }`

## Usage and Default Geo-IP Redirect options
### `redirectHost` (string)
- Base hostname used for redirects

### `supportedRegionsExpression` (string)
- Case-sensitive regular expression matching cloudfront-viewer-country

### `defaultRegion` (string)
- Fallback region code when viewer's country does not match the supported pattern

