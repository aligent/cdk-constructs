import 'source-map-support/register';
import { CloudFrontRequestEvent, CloudFrontRequest } from 'aws-lambda';

const REMAP_PATH = process.env.REMAP_PATH;

// Lambda handler for replacing the path of a request with another 
export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontRequest> => {
     let request = event.Records[0].cf.request;

     request.uri =  REMAP_PATH;

     return request;
}
