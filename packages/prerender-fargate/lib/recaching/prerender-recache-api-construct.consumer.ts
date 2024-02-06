import { Context, SQSEvent } from "aws-lambda";
import axios from "axios";

const userAgent = "prerender / Googlebot recaching request";

/**
 * Handles the recaching of URLs received via SQS event.
 * @param event - The SQS event containing the URLs to recache.
 * @param context - The AWS Lambda context object.
 */
export const handler = async (event: SQSEvent, _context: Context) => {
  for (const record of event.Records) {
    const url = record.body;
    console.log(`Fetching ${url} for recaching`);
    const res = await axios.get(url, {
      headers: {
        "User-Agent": userAgent,
      },
    });
    console.log(
      `Fetched URL: ${url}, Response Code: ${JSON.stringify(res.status)}`
    );
  }
};
