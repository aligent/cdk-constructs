# Geo-IP Redirect

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/geoip-redirect/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/geoip-redirect/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-geoip-redirect?color=green)

## Overview

This library provides a construct which creates a Lambda@Edge which is intended to be attached to the Origin Request in a CloudFront distribution. The construct allows a CloudFront website to perform GeoIP redirects to redirect users to a version of the website related to their location such as `.com` `.com.au` or `.co.nz` etc.

The Lambda@Edge function will check if the viewer's country code matches any supported regions. The user's country code for each request is pulled from the `cloudfront-viewer-country`. The construct will match the code to the record with the corresponding regex lookup.

## Usage and Default Geo-IP Redirect options

### `redirectHost` (string)

```
interface RedirectFunctionOptions {
	supportedRegions?:  Record<string, DomainOverwrite>;
	defaultRegionCode: string;
	defaultDomain: string;
}
```

| Property | Definition |
| -------- | ---------- |
| `supportedRegions`  | A record with domain codes as a key (regex) and a domain to redirect to as a value |
| `defaultRegionCode` | The default region code(s) as regex. These are the regions supported by `defaultDomain`. When multiple codes are used the default will be the first code the default site eg. `["AU","NZ"]` will treat `AU` as the default |
| `defaultDomain`     | The website's main domain. This will act as a fallback for any unsupported regions |
| `enablePathRedirect` | Will toggle adding a path suffix for a region such as `.com/au` or whether it should just be `.com` |

### Using this package

The two main ways you can use this package are as follows:
First off your website has a basic domain let's say `www.aligent.com.au` and you serve all content for all regions of the world here such as `www.aligent.com.au/au` or `www.aligent.com.au/nz`. For this approach you should use the below method

```
redirectBehaviourOptions: {
	defaultDomain: "www.aligent.com/au",
	defaultRegionCode: ["AU","NZ"],
}
```

Any region codes that are in the array like: `["XX","YY"]` will automatically add the matching region as a path suffix to the url as lowercase.

However in order to redirect to a website that is different from the base domain such as `www.aligent.co.nz` you can "hardcode" a domain for a region to use by using the `supportedRegions` value.

```
redirectBehaviourOptions: {
	defaultDomain: "www.aligent.com",
	defaultRegionCode: "AU,US",
	supportedRegions: { "NZ": "www.aligent.co.nz" }
}
```

_this package has not been tested with interplanetary domains_
