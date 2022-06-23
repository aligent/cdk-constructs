import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import axios from 'axios';

const userAgent = 'prerender / Googlebot recaching request';

export const handler = async (event: SQSEvent, context: Context) => {
    event.Records.forEach(async (record: SQSRecord) => {
        const url = record.body;
        console.log(`Fetching ${url} for recaching`);
        await axios.get(url, {
            headers: {
                'User-Agent': userAgent
            }
        })
    })
}
