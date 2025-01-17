import "source-map-support/register";
import {
  CloudFrontRequestEvent,
  CloudFrontResponse,
  CloudFrontRequest,
} from "aws-lambda";
import { DomainOverwrite, RedirectFunctionOptions } from '../redirect-construct'

const options: RedirectFunctionOptions = {
  defaultDomain: '',
  defaultRegionCode: '',
  supportedRegions: { '': '' }
}

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontResponse | CloudFrontRequest> => {
  const request = event.Records[0].cf.request;
  options.defaultDomain = process.env.DEFAULT_DOMAIN ?? "";
  options.defaultRegionCode = process.env.DEFAULT_REGION_CODE ?? "";
  const defaultRegion = options.defaultRegionCode.split("|")[0].toLowerCase();
  options.supportedRegions = {
    ...process.env.SUPPORTED_REGIONS as Record<string, DomainOverwrite> ?? "{}",
    ...{ [options.defaultRegionCode]: options.defaultDomain }
  };

  if (options.supportedRegions) {
    options.supportedRegions = Object.keys(options.supportedRegions).reduce((newRecord, key) => {
      newRecord[key.toLowerCase()] = options.supportedRegions ? options.supportedRegions[key] : "";
      return newRecord;
    }, {});
  }

  let redirectURL = `https://${options.defaultDomain}/`;
  if (request.headers["cloudfront-viewer-country"]) {
    const countryCode = request.headers["cloudfront-viewer-country"][0].value.toLowerCase();
    // Check if any key in supportedSubRegions matches the countryCode using regex
    const recordKey = Object.keys(options.supportedRegions).find(pattern =>
      new RegExp(`^(${pattern.toLowerCase()})$`).test(countryCode)
    )?.toLowerCase();
    if (recordKey) {
      redirectURL = `https://${options.supportedRegions[recordKey]}/`;
      if (recordKey.includes('|'))
        redirectURL = redirectURL + countryCode.toLowerCase()
    } else {
      redirectURL = `${redirectURL}${defaultRegion}${request.uri}`
    }

    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [
          {
            key: "Location",
            value: redirectURL.replace('/index.html', ''),
          },
        ],
      },
    };
  }

  return request;
};
