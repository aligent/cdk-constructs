import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SNSEvent } from 'aws-lambda';

const client = new SNSClient({ region: process.env.AWS_REGION });

export const handler = async (event: SNSEvent): Promise<void> => {
    const record = event.Records[0];
    const message = record.Sns.Message;
    
    const command = new PublishCommand({
        TopicArn: process.env.SNS_TOPIC,
        Message: message,
    });

    try {
        await client.send(command);
    } catch (e) {
        console.log(e);
    }
};
