import "source-map-support/register";
import {
  CloudFrontRequestEvent,
  CloudFrontResponse,
  CloudFrontRequest,
} from "aws-lambda";

import { GeoIpRegion } from '../redirect-construct'



export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontResponse | CloudFrontRequest> => {
  const DEFAULT_DOMAIN: string = process.env.DEFAULT_DOMAIN ?? "";
  const DEFAULT_REGION_CODE: string = process.env.DEFAULT_REGION_CODE ?? "";
  const SUPPORTED_REGIONS: GeoIpRegion[] = process.env.SUPPORTED_REGIONS as GeoIpRegion[] ?? [{ // this seems to not be correct, not passing as string!
    regionDomain: DEFAULT_DOMAIN,
    supportedSubRegions: { absoluteDomain: DEFAULT_DOMAIN, regionPath: DEFAULT_REGION_CODE.toLowerCase() },
  }];
  const request = event.Records[0].cf.request;

  let redirectURL = `https://${DEFAULT_DOMAIN}/`;
  if (request.headers["cloudfront-viewer-country"]) {
    const countryCode = request.headers["cloudfront-viewer-country"][0].value;
    const matchingRegionURL = SUPPORTED_REGIONS.map(region => {
      // Check if any key in supportedSubRegions matches the countryCode using regex
      const recordKey = Object.keys(region.supportedSubRegions).find(pattern =>
        new RegExp(`^(${pattern})$`).test(countryCode)
      );
      if (recordKey) {
        return region.supportedSubRegions[recordKey]
      }
      return null
    }).find((value) => value !== null);

    redirectURL = `${redirectURL}${countryCode.toLowerCase()}${request.uri}`
    if (matchingRegionURL) {
      redirectURL = `https://${matchingRegionURL}${request.uri}`
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
