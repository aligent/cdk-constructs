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
  console.log('====================================');
  console.log(process.env.DEFAULT_DOMAIN, process.env.DEFAULT_REGION_CODE, process.env.SUPPORTED_REGIONS);
  console.log('====================================');
  const DEFAULT_DOMAIN: string = process.env.DEFAULT_DOMAIN ?? "";
  const DEFAULT_REGION_CODE: string = process.env.DEFAULT_REGION_CODE ?? "";
  const SUPPORTED_REGIONS: GeoIpRegion[] = process.env.SUPPORTED_REGIONS ? JSON.parse(process.env.SUPPORTED_REGIONS) as GeoIpRegion[] : [{ // this seems to not be correct, not passing as string!
    regionDomain: DEFAULT_DOMAIN,
    supportedSubRegions: { DEFAULT_REGION_CODE: { absoluteDomain: DEFAULT_DOMAIN, regionPath: DEFAULT_REGION_CODE.toLowerCase() } },
  }];
  const request = event.Records[0].cf.request;

  let redirectURL = `https://${DEFAULT_DOMAIN}/`;
  if (request.headers["cloudfront-viewer-country"]) {
    console.log('====================================');
    console.log(request.headers["cloudfront-viewer-country"]);
    console.log('====================================');
    const countryCode = request.headers["cloudfront-viewer-country"][0].value;
    const matchingRegion = SUPPORTED_REGIONS.find(region => {
      // Check if any key in supportedSubRegions matches the countryCode using regex
      return Object.keys(region.supportedSubRegions).some(pattern =>
        new RegExp(`^(${pattern})$`).test(countryCode)
      );
    });

    if (matchingRegion) {
      const matchedKey = Object.keys(matchingRegion.supportedSubRegions).find(pattern =>
        new RegExp(`^(${pattern})$`).test(countryCode)
      );
      if (matchedKey) {
        const regionValue = matchingRegion.supportedSubRegions[matchedKey];
      }
      console.log('====================================');
      console.log(matchedKey);
      console.log('====================================');
    }

    const geoIpRegion = SUPPORTED_REGIONS.find(region => countryCode in region.supportedSubRegions)
    if (geoIpRegion) {
      const subRegion = geoIpRegion.supportedSubRegions[countryCode]
      redirectURL = subRegion ? `${subRegion}${request.uri}` : `${geoIpRegion.regionDomain}/${countryCode.toLowerCase()}${request.uri}`;
    } else {
      redirectURL = `${redirectURL}/${DEFAULT_REGION_CODE.toLowerCase()}${request.uri}`;
    }

    return {
      status: "302",
      statusDescription: "Found",
      headers: {
        location: [
          {
            key: "Location",
            value: redirectURL,
          },
        ],
      },
    };
  }

  return request;
};
