# Prerender Proxy
This library provides two function constructs and a construct that creates two Lambda@Edge functions to use prerender.io as a Cloudfront Origin for site indexers (Google, Bing, etc). 

The `prerender-check` is a `viewer-request` function that will check if a requester is from a indexer and if it is adds a header so that the second function `prerender` (`origin-request`) will alter the origin to prerender.io.

The `prerender` will function also make a HEAD request to a nominated backend to detect 301 and 302 redirects and if so forward them on to the frontend. This ensures that your SEO rankings are not penalized by having multiple pages at the same URL.

These functions are intended to be addeed to an existing Cloudfront  

## Props
`redirectBackendOrigin`: The backend origin to make the HEAD request to.
`redirectFrontendHost`: This hostname is used to replace the backend host for any redirects that contain the backend host.
`prerenderToken`: Your prerender.io authentication token
