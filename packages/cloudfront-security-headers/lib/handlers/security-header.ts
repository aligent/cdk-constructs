import { CloudFrontResponse, CloudFrontResponseEvent } from 'aws-lambda';

export const handler = async (event: CloudFrontResponseEvent): Promise<CloudFrontResponse> => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;

    // Add in security headers 
    headers['strict-transport-security'] = [{key: 'Strict-Transport-Security', value: 'max-age=108000; includeSubdomains; preload'}];
    headers['content-security-policy'] = [{key: 'Content-Security-Policy', value: __CONTENT_SECURITY_POLICY__}];
    headers['x-content-type-options'] = [{key: 'X-Content-Type-Options', value: 'nosniff'}];
    headers['x-frame-options'] = [{key: 'X-Frame-Options', value: 'DENY'}];

    return response;
}