import { Context, SQSEvent } from "aws-lambda";
import axios from "axios";

const userAgent = "prerender / Googlebot recaching request";

/**
 * Handles the recaching of URLs received via SQS event.
 * @param event - The SQS event containing the URLs to recache.
 * @param context - The AWS Lambda context object.
 */
export const handler = async (event: SQSEvent, _context: Context) => {
  // Only one item in the message is assumed.
  const url = event.Records[0].body;
  console.log(`Fetching ${url} for recaching`);
  const res = await axios.get(url, {
    headers: {
      "User-Agent": userAgent,
    },
  });
  console.log(
    `Requested ${url} recaching, got ${JSON.stringify(
      res.status
    )}, response headers: ${JSON.stringify(res.headers)}`
  );
};
