import 'source-map-support/register';
import { CloudFrontRequestEvent, CloudFrontResponse, CloudFrontRequest } from 'aws-lambda';

const REDIRECT_HOST = process.env.REDIRECT_HOST;
const SUPPORTED_REGIONS = new RegExp(process.env.SUPPORTED_REGIONS);
const DEFAULT_REGION = process.env.DEFAULT_REGION;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponse|CloudFrontRequest> => {
     let request = event.Records[0].cf.request;

     let redirectURL = `https://${REDIRECT_HOST}/`;
     if (request.headers['cloudfront-viewer-country']) {
          const countryCode = request.headers['cloudfront-viewer-country'][0].value;
          if (SUPPORTED_REGIONS.test(countryCode)) {
               redirectURL = `${redirectURL}${countryCode.toLowerCase()}${request.uri}`;
          } else {
               redirectURL = `${redirectURL}${DEFAULT_REGION.toLowerCase()}${request.uri}`;
          }

          return {
               status: '302',
               statusDescription: 'Found',
               headers: {
                    location: [{
                         key: 'Location',
                         value: redirectURL,
                    }],
               },
          };
     }

     return request;

}
