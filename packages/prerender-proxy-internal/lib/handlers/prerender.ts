import 'source-map-support/register';
import { CloudFrontRequest, CloudFrontRequestEvent, CloudFrontResponse } from '@aws-cdk/aws-lambda';
import { Buffer } from 'buffer';

const PATH_PREFIX = process.env.PATH_PREFIX;

const PRERENDER_URL = process.env.PRERENDER_URL;
const PRERENDER_USER = process.env.PRERENDER_USER;
const PRERENDER_PASS = process.env.PRERENDER_PASS;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponse | CloudFrontRequest> => {
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

          let buff = new Buffer(`${PRERENDER_USER}:${PRERENDER_PASS}`);
          let authToken = buff.toString('base64');

          request.origin = {
               custom: {
                    domainName: PRERENDER_URL,
                    port: 443,
                    protocol: 'https',
                    readTimeout: 20,
                    keepaliveTimeout: 5,
                    sslProtocols: ['TLSv1', 'TLSv1.1', 'TLSv1.2'],
                    path: '/https%3A%2F%2F' + request.headers['x-prerender-host'][0].value,
                    customHeaders: {
                         'x-prerender-authorization': [{
                              key: 'x-prerender-authorization',
                              value: `Basic ${authToken}` 
                         }]
                    }
               }
          };
     } else {
          request.uri = `${PATH_PREFIX}/index.html`;
     }

     return request;
}
