import "source-map-support/register";
import {
  CloudFrontRequestEvent,
  CloudFrontResponse,
  CloudFrontRequest,
} from "aws-lambda";

import { GeoIpRegion } from '../redirect-construct'

const DEFAULT_DOMAIN: string = process.env.DEFAULT_DOMAIN!;
const DEFAULT_REGION: string = process.env.DEFAULT_REGION!;
const SUPPORTED_REGIONS: GeoIpRegion[] = process.env.SUPPORTED_REGIONS ? JSON.parse(process.env.SUPPORTED_REGIONS) : [{
  regionDomain: DEFAULT_DOMAIN,
  supportedSubRegions: { DEFAULT_REGION: { absoluteDomain: DEFAULT_DOMAIN, regionPath: DEFAULT_REGION.toLowerCase() } },
}];

export const handler = async (
  event: CloudFrontRequestEvent
): Promise<CloudFrontResponse | CloudFrontRequest> => {
  const request = event.Records[0].cf.request;

  let redirectURL = `https://${DEFAULT_DOMAIN}/`;
  if (request.headers["cloudfront-viewer-country"]) {
    const countryCode = request.headers["cloudfront-viewer-country"][0].value;
    const geoIpRegion = SUPPORTED_REGIONS.find(region => countryCode in region.supportedSubRegions)
    if (geoIpRegion) {
      const subRegion = geoIpRegion.supportedSubRegions[countryCode]
      redirectURL = subRegion ? `${subRegion}${request.uri}` : `${geoIpRegion.regionDomain}/${countryCode.toLowerCase()}${request.uri}`;
    } else {
      redirectURL = `${redirectURL}/${DEFAULT_REGION.toLowerCase()}${request.uri}`;
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
