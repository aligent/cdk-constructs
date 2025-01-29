# AWS CDK CloudFront Security Headers
![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/cloudfront-security-headers/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/cloudfront-security-headers/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-cloudfront-security-headers?color=green)

This package contains a Lambda@Edge function for Cloudfront to add security headers to the origin response of all requests.

The function is intended to be added to an existing Cloudfront. 

## Usage and Default Options
### `contentSecurityPolicy` (array&lt;string&gt;, optional)
- Array to store content security policies to attach

## Security headers attached

### `headers["strict-transport-security"]` (aka HSTS) 
- Informs browsers that the site should only be accessed using a HTTPS connection. 
#### **Value Directives**:

- **`max-age=<expire-time>` (seconds):** 
    - Time is set to 108000s seconds / 30 hours. Specifies the length of time the browser should remember that site can only be accessed using HTTPS

- **`includeSubdomains` (boolean, optional):**
    - Option is specifcied. The rule will apply to all of the site's subdomains

- **`preload` (boolean, optional):**
    - Option is specificed. The will be preloaded into the HSTS Preload List. 
    
    - The **Preload List** is a list built into major web browsers like Chromium, Edge and Firefox. It is a list containing domains that HTTPS enforcement is automatically applied _before_ the browser receives the STS header. 

    - This soves the first-load problem of a browser not knowing a site's HSTS policy before the user has visited the site for a first time.


### `headers["content-security-policy"]`
- Allows control over resources that the user agent is allowed to load for a given page. CSPs help guard agaisnt cross-site scripting attacks.
#### **Value**:
- **`__CONTENT_SECURITY_POLICY__`:**
    - Defined as an option in `index.ts`. See **Usage and Default Options** above.

### `headers["x-content-type-options"]`
- Indicates that the MIME types advertised in the `Content-Type` headers should be respected and not changed.
#### **Value**:
- **`nosniff` (boolean):**
    - Option is specified. Blocks a request if request destination is of type `style` and the MIME type is not `test/css` or of type `script` and the MIME type is not a JavaScript MIME type.

### `headers["x-frame-options"]`
- Indicates whether a browser should be allowed to render a page in a `<frame>`, `<iframe>`, `<embed>` or `<object>`. Helps to avoid clickjacking attacks by ensuring content is not embedded into other sites.
#### **Value Directives**:
- **`DENY`(boolean, optional):**
    - Option is specified. The page cannot be displayed in a frame, regardless of the site attempting to do so.

- **`SAMEORIGIN`(boolean, optional):**
    - The page can only be displayed if all ancestor frames are same origin to the page itself.
