import { Context, SQSEvent, SQSRecord } from 'aws-lambda';
import axios from 'axios';

export const handler = async (event: SQSEvent, context: Context) => {
    event.Records.forEach(async (record: SQSRecord) => {
        const url = record.body;
        await axios.get(url, {
            headers: {
                'User-Agent': 'prerender / googlebot recache'
            }
        })
    })
}