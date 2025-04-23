import { CloudFrontResponseEvent, CloudFrontResponse } from "aws-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.BUCKET_REGION,
});

const CSP_OBJECT = process.env.CSP_OBJECT;
const S3_BUCKET = process.env.S3_BUCKET;

const REPORT_URI = process.env.REPORT_URI;

const FALLBACK_CSP = process.env.FALLBACK_CSP;

export const handler = async (
  event: CloudFrontResponseEvent
): Promise<CloudFrontResponse> => {
  const response = event.Records[0].cf.response;
  response.headers = response.headers || {};

  let csp = "";

  if (REPORT_URI) {
    response.headers["reporting-endpoints"] = [
      { key: "Reporting-Endpoints", value: `report_endpoint="${REPORT_URI}"` },
    ];

    // Add both report-to and report-uri for backwards compatibility
    csp += `report-uri ${REPORT_URI}; report-to report_endpoint; `;
  }

  try {
    if (!CSP_OBJECT || !S3_BUCKET) {
      throw new Error("CSP_FILE or S3_BUCKET environment variable is missing");
    }

    const params = { Bucket: S3_BUCKET, Key: CSP_OBJECT };

    const s3Object = await s3.send(new GetObjectCommand(params));

    if (!s3Object.Body) {
      throw new Error("CSP file is empty or missing");
    }

    csp += await s3Object.Body.transformToString();

    console.log("CSP file retrieved:", csp);

    response.headers["content-security-policy"] = [
      { key: "Content-Security-Policy", value: csp },
    ];
  } catch (error) {
    console.error("Error fetching CSP file or adding header:", error);

    // If no fallback was provided, throw the error and 500 response
    if (!FALLBACK_CSP) throw error;

    response.headers["content-security-policy"] = [
      { key: "Content-Security-Policy", value: FALLBACK_CSP },
    ];
    throw error;
  }

  return response;
};
