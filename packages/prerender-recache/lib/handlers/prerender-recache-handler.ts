import { Context, APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectsCommand, DeleteObjectsCommandOutput, ObjectIdentifier } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

interface PreRenderRequestBody {
    prerenderToken: string;
    url?: string;
    urls?: string[];
}

const QueueUrl = process.env.SQS_QUEUE_URL;
const Bucket = process.env.PRERENDER_CACHE_BUCKET;

export const MAX_URLS: number = 1000;
export const PARAM_PREFIX: string = "prerender/recache/tokens";

const sqsClient = new SQSClient({});
const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

const tokens = {};

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    let urlsToRecache: string[];

    try {
        urlsToRecache = await getUrlsToRecache(event.body || "");
    } catch (e) {
        return {
            statusCode: 403,
            body: JSON.stringify({
                error: e.message,                
                message: `Token does not exist or is misconfigured`,
            }),
        } 
    }
    
    if (urlsToRecache.length > MAX_URLS) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: `Too many urls, maximum is ${MAX_URLS}`,
            }),
        }
    }

    await deleteCacheContentForUrls(urlsToRecache);
    await queueRecachineUrls(urlsToRecache);

    return {
        statusCode: 200,
        body: JSON.stringify({
            urlsToRecache
        }),
    };
}


const getUrlsToRecache = async (body: string): Promise<string[]> => {
    const requestBody: PreRenderRequestBody = JSON.parse(body);

    let urls: string[];
    if (requestBody.urls !== undefined) {
        urls = requestBody.urls;
    } else if (requestBody.url !== undefined) {
        urls = [requestBody.url];
    } else {
        urls = [];
    }

    if (!tokens.hasOwnProperty(requestBody.prerenderToken)) {
        const getAllowedUrls = new GetParametersCommand({
            Names: [
                `${PARAM_PREFIX}/${requestBody.prerenderToken}`
            ]
        });

        const ssmResponse = await ssmClient.send(getAllowedUrls);

        if (ssmResponse.Parameters === undefined) {
            throw 'No parameters returned';
        }

        const allowedUrlsResult = ssmResponse.Parameters[0];
        if (allowedUrlsResult.DataType === undefined) {
            throw 'Token not valid';
        }

        if (allowedUrlsResult.DataType !== 'StringList') {
            throw 'Token data is not a string list';
        }
        
        tokens[requestBody.prerenderToken] = allowedUrlsResult.Value?.split(',');
    }

    const allowedUrls = tokens[requestBody.prerenderToken];

    const isValidUrlForToken = (url: string): boolean => allowedUrls.find(a => url.includes(a)) !== undefined;

    return urls.filter(isValidUrlForToken);
}

const deleteCacheContentForUrls = async (urlsToRecache: string[]): Promise<DeleteObjectsCommandOutput> => {
    const mapUrlToKey = (Key: string): ObjectIdentifier => {
        return { Key };
    }

    const deleteObjects = new DeleteObjectsCommand({
        Bucket,
        Delete: {
            Objects: urlsToRecache.map(mapUrlToKey),
            Quiet: true
        }
    });

    return await s3Client.send(deleteObjects);
}

const queueRecachineUrls = async (urlsToRecache: string[]) => {
    const generateEntry = (url: string): SendMessageBatchRequestEntry => {
        return {
            DelaySeconds: 1,
            Id: url.replace(/[^A-Z0-9_-]+/gi, '_').substring(0, 79),
            MessageBody: url
        }
    }

    const urlsToRequest = chunkUrls(urlsToRecache, 10);

    const messages = urlsToRequest.map((urls: string[]) => {
        return new SendMessageBatchCommand({
            QueueUrl,
            Entries: urls.map(generateEntry)
        });
    });

    await Promise.all(messages.map(m => sqsClient.send(m)));
}

const chunkUrls = (array: string[], chunkSize: number): string[][] => {
    const chunks: string[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        const chunk = array.slice(i, i + chunkSize);
        chunks.push(chunk);
    }

    return chunks;
}