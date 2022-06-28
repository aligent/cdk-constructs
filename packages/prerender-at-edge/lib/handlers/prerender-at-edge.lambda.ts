const prerender = require('prerender');
const s3Cache = require('prerender-aws-s3-cache');
import { CloudFrontRequest, CloudFrontRequestEvent, CloudFrontResponse } from 'aws-cdk-lib/aws-lambda';
import axios, { AxiosResponse } from 'axios';

const PATH_PREFIX = process.env.PATH_PREFIX;

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontResponse | CloudFrontRequest> => {
    let request = event.Records[0].cf.request;

    // viewer-request function will determine whether we prerender or not
    // if we should we add prerender as our custom origin
    if (request.headers['x-request-prerender']) {
        // Start the prerender server
        const server = prerender_server();

        // Cloudfront will alter the request for / to /index.html
        // since it is defined as the default root object
        // we do not want to do this when prerendering the homepage
        if (request.uri === `${PATH_PREFIX}/index.html`) {
            request.uri = `${PATH_PREFIX}/`;
        }

        request.origin = {
            custom: {
                domainName: 'localhost:3000',
                port: 80,
                protocol: 'http',
                readTimeout: 20,
                keepaliveTimeout: 5,
                path: '/http%3A%2F%2F' + request.headers['x-prerender-host'][0].value,
            }
        };

        console.log(JSON.stringify(request.uri));
        request = await prerender_request(request.uri);
    } else {
        request.uri = `${PATH_PREFIX}/index.html`;
    }

    return request;
}

const prerender_server = async (): Promise<any> => {
    const server = prerender({
        chromeFlags: ['--no-sandbox', '--headless', '--disable-gpu', '--remote-debugging-port=9222', '--hide-scrollbars', '--disable-dev-shm-usage'],
        forwardHeaders: true,
        chromeLocation: '/usr/bin/chromium-browser'
    });

    server.use(prerender.blacklist());
    server.use(prerender.httpHeaders());
    server.use(prerender.removeScriptTags());
    server.use(s3Cache);

    server.start();
}

const prerender_request = async (url: string): Promise<AxiosResponse> => {
    return axios.get(url);
}
