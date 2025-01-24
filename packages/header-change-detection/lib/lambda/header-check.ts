import axios from "axios";
import { DynamoDBClient, BatchGetItemCommand, BatchGetItemCommandInput, KeysAndAttributes, UpdateItemCommandInput, UpdateItemCommand, AttributeValueUpdate, UpdateItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { PublishCommand, PublishInput, SNSClient } from "@aws-sdk/client-sns";

const URLS = process.env.URLS;
const HEADERS = process.env.HEADERS;
const TABLE = process.env.TABLE!;

const config = ""
const DB_CLIENT = new DynamoDBClient(config);

const securityHeaders = HEADERS?.split(",") || []

type Headers = Map<string, string | undefined>

// A map of URLs and their headers
type URLHeaders = Map<string, Headers>

export const handler = async () => {
  const urls = URLS?.split(',') || [];

  // Fetch stored headers
  const [storedUrlHeaders, currentUrlHeaders] = await Promise.all([
    getStoredValues(urls),
    fetchHeaders(urls)
  ]);

  // Find any differences between the headers
  const headerDifferences = new Map<string, Difference[]>();
  let differencesDetected = false;
  const dbUpdates = urls.map(url => {
    const currentHeaders = currentUrlHeaders.get(url);
    const storedHeaders = storedUrlHeaders.get(url) || new Map<string, string | undefined>();

    if (!currentHeaders) throw new Error(`Could not get current headers for ${url}`);

    // Check all headers that we care about
    headerDifferences.set(url, compareHeaders(securityHeaders, storedHeaders, currentHeaders));

    const headersToUpdate: Headers = new Map<string, string | undefined>();
    headerDifferences.get(url)?.forEach(difference => {
      headersToUpdate.set(difference.header, difference.currentValue);
      differencesDetected = true;
    });

    return updateStoredValues(url, headersToUpdate);
  })

  await Promise.all(dbUpdates);

  if (differencesDetected)
    await sendToSns(formatDifferences(headerDifferences));
};

/**
 * Fetch security headers for the given urls
 *
 * @param urls list of urls to fetch headers from
 */
const fetchHeaders = async (urls: string[]): Promise<URLHeaders> => {
  const currentUrlHeaders: URLHeaders = new Map<string, Headers>();

  // Make an axios request for each url
  await Promise.all(urls.map(url => axios.get(url).then(response => {
    // Then get all the security headers from each response
    const headers: Headers = new Map<string, string | undefined>();

    Object.entries(response.headers).forEach(([headerName, value]) => {
      if (securityHeaders?.includes(headerName))
        headers.set(headerName, value as string);
    });

    currentUrlHeaders.set(url, headers);
  })));

  return currentUrlHeaders;
}

/**
 * Get values stored in DynamoDB table from a list of string keys.
 * Assumes the call is made to the header change detection table.
 * This table has a primary key of Url (string) with an unknown
 * number of string fields.
 *
 * @param keys array of strings
 */
const getStoredValues = async (keys: string[]): Promise<URLHeaders> => {
  if (keys.length === 0) {
    console.log("No keys were passed")
    return new Map<string, Headers>();
  }

  // Construct the command input
  const primaryKeys = keys.map(url => {
    return {
      Url: {
        "S": url
      }
    }
  })
  const requestItems = {
    [TABLE]: {
      "Keys": primaryKeys
    }
  }

  return dynamoBatchRequest(requestItems);
}

/**
 * Update stored headers for the given url.
 * If the header no longer has a value, delete it. Otherwise update it.
 *
 * @param url the url to update - this is the primary key
 * @param headers record of headers to update
 */
const updateStoredValues = async (url: string, headers: Headers): Promise<UpdateItemCommandOutput | undefined> => {
  // Convert headers to attribute value update attributes
  const attributes: Record<string, AttributeValueUpdate> = {};
  headers.forEach((value, headerName) => {
    // If the value exists update it, otherwise remove it
    if (value) {
      attributes[headerName] = {
        Value: {
          "S": value
        },
        Action: 'PUT'
      }
    } else {
      attributes[headerName] = {
        Action: 'DELETE'
      }
    }
  });

  if (Object.values(attributes).length === 0) {
    console.log(`No attribute value changes for ${url}`);
    return;
  }

  return dynamoUpdateRequest(url, attributes);
}

/**
 * Recursive function to get multiple items from a DynamoDB table
 *
 * @param requestItems
 * @returns Promise<URLHeaders>
 */
const dynamoBatchRequest = async (requestItems: Record<string, KeysAndAttributes> | undefined): Promise<URLHeaders> => {
  console.log(`Starting batch request with items: ${JSON.stringify(requestItems)}`);

  // Validate that request items has values
  if (Object.keys(requestItems || {})?.length === 0) return new Map<string, Headers>();

  const batchGetInput: BatchGetItemCommandInput = { RequestItems: requestItems }
  const batchGetCommand = new BatchGetItemCommand(batchGetInput);

  // Fetch stored stored headers
  const response = await DB_CLIENT.send(batchGetCommand);
  const responses = response.Responses?.[TABLE]!;

  console.log(`Got following data from dynamo table: ${JSON.stringify(responses)}`);

  const storedUrlHeaders: URLHeaders = new Map<string, Headers>();
  Object.values(responses).forEach(headers => {
    const urlHeaders: Headers = new Map<string, string | undefined>();

    let url = '';
    Object.entries(headers).forEach(([headerName, value]) => {
      if (headerName === "Url") {
        url = value.S!;
      } else {
        urlHeaders.set(headerName, value.S!);
      }
    });
    storedUrlHeaders.set(url, urlHeaders);
  });

  // Process any remaining keys
  const nextUrlHeaders = await dynamoBatchRequest(response.UnprocessedKeys);

  // Merge data into one object and return
  return new Map<string, Headers>([...storedUrlHeaders, ...nextUrlHeaders]);
}

/**
 * Send an update command to DynamoDB
 *
 * @param url the url to update - this is the primary key
 * @param attributes Record<string, AttributeValueUpdate>
 */
const dynamoUpdateRequest = async (url: string, attributes: Record<string, AttributeValueUpdate>): Promise<UpdateItemCommandOutput> => {
  console.log(`Updating ${url} in table with: ${JSON.stringify(Object.entries(attributes))}`);

  const updateItemInput: UpdateItemCommandInput = {
    TableName: TABLE,
    Key: {
      Url: {
        "S": url
      }
    },
    AttributeUpdates: attributes
  };
  const updateItemCommand = new UpdateItemCommand(updateItemInput);

  return DB_CLIENT.send(updateItemCommand);
}

interface Difference {
  header: string
  storedValue: string | undefined
  currentValue: string | undefined
}

/**
 * Compare values of two lists of headers. Return any headers that have differences
 * along with their stored and current values.
 *
 * @param headers list of headers we want to compare
 * @param stored list of headers that were last found on the site
 * @param current list of headers currently on the site
 * @returns
 */
const compareHeaders = (headers: string[], stored: Headers, current: Headers): Difference[] => {
  const differences: Difference[] = [];

  headers.forEach(header => {
    const currentValue = current.get(header);
    const storedValue = stored.get(header);

    if (currentValue !== storedValue) {
      differences.push({
        header,
        storedValue: storedValue,
        currentValue: currentValue
      });
    }
  })

  return differences;
}

/**
 * Format the differences so they can be easily read in an email.
 *
 * Outputs a string that looks like this:
 *
 * Headers differences found:
 * == https://aligent.com.au/ ===
 *
 * Header: example-header-name
 * Stored Value: No stored value
 * Current Value: example-value
 *
 * === https://aligent.com.au/contact ===
 *
 * Header: example-header-name
 * Stored Value: No stored value
 * Current Value: example-value
 *
 * Header: example-header-name-2
 * Stored Value: previous-value
 * Current Value: new-example-value
 *
 * @param differences Map<string, Difference[]> where the key is the URL
 */
const formatDifferences = (differences: Map<string, Difference[]>): string => {
  const message = Array.from(differences.keys()).reduce((text, url) => {
    console.log(text, url);
    // Skip the url if there are no differences
    if (differences.get(url)?.length === 0) {
      return text;
    }

    // Format headers nicely
    const headers = differences.get(url)?.reduce((headerText, header) => {
      return headerText += `\r\nHeader: ${header.header}\r\nStored Value: ${header.storedValue}\r\nCurrent Value: ${header.currentValue}\r\n`;
    }, "");

    return `${text}\r\n=== ${url} ===\r\n ${headers}`
  }, "");

  return `Header differences found${message}`;
}

const TOPIC_ARN = process.env.TOPIC_ARN!;
const SNS_CLIENT = new SNSClient();

/**
 * Send a message to the SNS topic
 *
 * @param message string to send to sns
 */
const sendToSns = async (message: string) => {
  const publishInput: PublishInput = {
    TopicArn: TOPIC_ARN,
    Message: message
  };
  const publishCommand = new PublishCommand(publishInput);
  await SNS_CLIENT.send(publishCommand);
}
