import { Context, APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectsCommand, DeleteObjectsCommandOutput, ObjectIdentifier } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

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

const tokens: Map<string, string[]> = new Map();

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    let urlsToRecache: string[];

    try {
        urlsToRecache = await getUrlsToRecache(event.body || "");
        console.log(urlsToRecache);
    } catch (error) {
        return {
            statusCode: 403,
            body: JSON.stringify({
                error,
                message: `Token does not exist or is misconfigured`,
            }),
        }
    }

    if (urlsToRecache.length > MAX_URLS) {
        console.log(`Too many urls, received ${urlsToRecache.length}, maximum is ${MAX_URLS}`)
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: `Too many urls, maximum is ${MAX_URLS}`,
            }),
        }
    }

    if (urlsToRecache.length === 0) {
        console.log('No valid urls to recache');
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "No urls to recache"
            })
        };
    }

    console.log(await deleteCacheContentForUrls(urlsToRecache));
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

    const token = requestBody.prerenderToken;

    if (!tokens.has(token)) {
        const Name = `/${PARAM_PREFIX}/${token}`;
        console.log(`Looking for allowed urls in ssm:${Name}`);

        const getAllowedUrls = new GetParameterCommand({ Name });
        console.log(getAllowedUrls);

        const ssmResponse = await ssmClient.send(getAllowedUrls);

        if (ssmResponse.Parameter === undefined) {
            throw 'No parameters returned';
        }

        const allowedUrlsResult = ssmResponse.Parameter;
        if (allowedUrlsResult.Type === undefined) {
            throw 'Token not valid';
        }

        if (allowedUrlsResult.Type !== 'StringList') {
            throw `Token data is not a string list, ${Name} is ${allowedUrlsResult.Type}`;
        }

        tokens.set(token, allowedUrlsResult.Value?.split(',') || []);
    }

    const allowedUrls = tokens.get(token) || [];

    console.log(`Allowed urls for ${token}: ${allowedUrls.join(', ')}`)

    const isValidUrlForToken = (url: string): boolean => allowedUrls.find(a => url.includes(a)) !== undefined;

    return urls.filter(isValidUrlForToken);
}

const deleteCacheContentForUrls = async (urlsToRecache: string[]): Promise<DeleteObjectsCommandOutput> => {
    const mapUrlToKey = (Key: string): ObjectIdentifier => {
        return { Key };
    }

    console.log(`Deleting ${urlsToRecache.length} objects from ${Bucket}`);

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

    console.log(`Sending ${messages.length} recaching message batches`);

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