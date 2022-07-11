import 'source-map-support/register';
import { CloudFrontRequest, CloudFrontRequestEvent, CloudFrontResponse } from 'aws-cdk-lib/aws-lambda';

const PRERENDER_TOKEN = process.env.PRERENDER_TOKEN;
const PATH_PREFIX = process.env.PATH_PREFIX;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponse|CloudFrontRequest> => {
  let request = event.Records[0].cf.request;

  // viewer-request function will determine whether we prerender or not
  // if we should we add prerender as our custom origin
  if (request.headers['x-request-prerender']) {
       // Cloudfront will alter the request for / to /index.html
       // since it is defined as the default root object
       // we do not want to do this when prerendering the homepage
       if (request.uri === `${PATH_PREFIX}/index.html`) {
            request.uri = `${PATH_PREFIX}/`;
       }

       request.origin = {
            custom: {
                 domainName: 'service.prerender.io',
                 port: 443,
                 protocol: 'https',
                 readTimeout: 20,
                 keepaliveTimeout: 5,
                 sslProtocols: ['TLSv1', 'TLSv1.1', 'TLSv1.2'],
                 path: '/https%3A%2F%2F' + request.headers['x-prerender-host'][0].value,
                 customHeaders: {
                      'x-prerender-token': [{
                           key: 'x-prerender-token',
                           value: PRERENDER_TOKEN
                      }]
                 }
            }
       };
  } else {
       request.uri = `${PATH_PREFIX}/index.html`;
  }

  return request;
}
