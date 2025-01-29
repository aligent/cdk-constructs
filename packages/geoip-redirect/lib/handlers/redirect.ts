import "source-map-support/register";
import {
  CloudFrontRequestEvent,
  CloudFrontResponse,
  CloudFrontRequest,
} from "aws-lambda";

const options = {
  defaultDomain: process.env.DEFAULT_DOMAIN ?? "",
  defaultRegionCode: process.env.DEFAULT_REGION_CODE ?? "",
  supportedRegions: { "": "" } as Record<string, string>,
  enablePathRedirect:
    process.env.ENABLE_PATH_REDIRECT === "true" ? true : false,
};

options.supportedRegions = {
  ...(JSON.parse(
    JSON.stringify(process.env.SUPPORTED_REGIONS ?? "{}")
  ) as Record<string, string>),
  ...{ [options.defaultRegionCode]: options.defaultDomain },
};

const defaultRegion = options.defaultRegionCode.split(",")[0].toLowerCase();

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontResponse | CloudFrontRequest> => {
  const request = event.Records[0].cf.request;

  // this block takes the records in supportedRegions and converts the keys to lowercase.
  // doesn't change the functionality but makes it easier for users to not worry about being case sensitive
  if (options.supportedRegions) {
    options.supportedRegions = Object.keys(options.supportedRegions).reduce(
      (newRecord, key) => {
        newRecord[key.toLowerCase()] = options.supportedRegions
          ? options.supportedRegions[key]
          : "";
        return newRecord;
      },
      {} // keeps the value for the corresponding key
    );
  }

  let redirectURL = `https://${options.defaultDomain}/`;
  if (request.headers["cloudfront-viewer-country"]) {
    const countryCode =
      request.headers["cloudfront-viewer-country"][0].value.toLowerCase();
    // Check if any key in supportedSubRegions matches the countryCode using regex
    const recordKey = Object.keys(options.supportedRegions || {})
      .find(recordRegionCode =>
        recordRegionCode.toLowerCase().includes(countryCode)
      )
      ?.toLowerCase();
    // if theres a record key it means a redirect domain was hardcoded in the value we can get the value of a record using record[key]
    if (recordKey) {
      redirectURL = `https://${options.supportedRegions[recordKey]}/`;
      // If the key includes multiple domains, we additionally want to redirect to the country path of the user
      if (recordKey.includes(",")) redirectURL += countryCode.toLowerCase();
    } else {
      // otherwise direct to the default domain
      redirectURL = `${redirectURL}${request.uri}`;
      if (options.enablePathRedirect)
        redirectURL = `${redirectURL}${defaultRegion}${request.uri}`;
    }
    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [
          {
            key: "Location",
            value: redirectURL.replace("/index.html", ""),
          },
        ],
      },
    };
  }

  return request;
};
