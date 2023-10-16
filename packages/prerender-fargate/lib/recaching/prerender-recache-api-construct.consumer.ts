import { Context, SQSEvent, SQSRecord } from "aws-lambda";
import axios from "axios";

const userAgent = "prerender / Googlebot recaching request";

/**
 * Handles the recaching of URLs received via SQS event.
 * @param event - The SQS event containing the URLs to recache.
 * @param context - The AWS Lambda context object.
 */
export const handler = async (event: SQSEvent, _context: Context) => {
  event.Records.forEach(async (record: SQSRecord) => {
    const url = record.body;
    console.log(`Fetching ${url} for recaching`);
    await axios.get(url, {
      headers: {
        "User-Agent": userAgent,
      },
    });
  });
};
