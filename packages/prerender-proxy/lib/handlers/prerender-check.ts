import 'source-map-support/register';
import { CloudFrontRequest, CloudFrontRequestEvent } from 'aws-lambda';

const IS_BOT = /googlebot|chrome-lighthouse|lighthouse|adsbot\-google|Feedfetcher\-Google|bingbot|yandex|baiduspider|Facebot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkShare|W3C_Validator/i;
const IS_FILE = /\.(js|css|xml|less|png|jpg|jpeg|gif|pdf|doc|txt|ico|rss|zip|mp3|rar|exe|wmv|doc|avi|ppt|mpg|mpeg|tif|wav|mov|psd|ai|xls|mp4|m4a|swf|dat|dmg|iso|flv|m4v|torrent|ttf|woff|svg|eot)$/i;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontRequest> => {
    let request = event.Records[0].cf.request;

    // If the request is from a bot, is not a file and is not from prerender
    // then set the x-request-prerender header so the origin-request lambda function
    // alters the origin to prerender.io
    if (!IS_FILE.test(request.uri) 
        && IS_BOT.test(request.headers['user-agent'][0].value)
        && !request.headers['x-prerender']) {
        request.headers['x-request-prerender'] = [
            {
                key: 'x-request-prerender',
                value: 'true'
            }
        ];

        request.headers['x-prerender-host'] = [{ key: 'X-Prerender-Host', value: request.headers.host[0].value}];
    }

    return request;
}
