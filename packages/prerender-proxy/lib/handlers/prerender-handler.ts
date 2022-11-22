import 'source-map-support/register';
import {sendToPrerender} from '../sendToPrerender';
import { CloudFrontRequest, CloudFrontRequestEvent, CloudFrontResponse } from 'aws-lambda';

const PRERENDER_TOKEN = process.env.PRERENDER_TOKEN;
const PATH_PREFIX = process.env.PATH_PREFIX;
const PRERENDER_URL = process.env.PRERENDER_URL;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponse|CloudFrontRequest> => {
  let request = event.Records[0].cf.request;

  return sendToPrerender(request)
}
