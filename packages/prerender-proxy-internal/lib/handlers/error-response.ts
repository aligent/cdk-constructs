import 'source-map-support/register';
import { CloudFrontRequest, CloudFrontResponseEvent, CloudFrontResponse } from 'aws-lambda';
import axios from "axios";
import { URL } from 'url';
import * as https from 'https';

const FRONTEND_HOST = process.env.FRONTEND_HOST;
const PATH_PREFIX = process.env.PATH_PREFIX;

// Create axios client outside of lambda function for re-use between calls
const instance = axios.create({
  timeout: 1000,
  // Don't follow redirects
  maxRedirects: 0,
  // Only valid response codes are 200 
  validateStatus: function (status) {
    return status == 200;
  },
  // keep connection alive so we don't constantly do SSL negotiation
  httpsAgent: new https.Agent({ keepAlive: true }),
});

export const handler = (event: CloudFrontResponseEvent): Promise<CloudFrontResponse|CloudFrontRequest> => {
  let response = event.Records[0].cf.response;
  let request = event.Records[0].cf.request;

  if (response.status != '200' && 
      ! request.headers['x-request-prerender'] &&
      request.uri != `${PATH_PREFIX}/index.html`) {
    
    // Fetch default page and return body
    return instance.get(`https://${FRONTEND_HOST}${PATH_PREFIX}/index.html`).then((res) => {
      response.body = res.data;

      
      response.headers['content-type'] = [{
        key: 'Content-Type',
        value: 'text/html'
      }];

      // Remove content-length if set as this may be the value from the origin.
      delete response.headers['content-length']

      return response;
    }).catch((err) => {
      return response
    });
  }

  return Promise.resolve(response);
}
