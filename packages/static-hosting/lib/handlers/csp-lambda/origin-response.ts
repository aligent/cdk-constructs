import { CloudFrontResponseEvent, CloudFrontResponse } from "aws-lambda";
import { S3 } from "aws-sdk"; // Lambda comes pre-bundled with SDK v2, so use that instead of v3 for now

const s3 = new S3();

const CSP_OBJECT = process.env.CSP_OBJECT;
const S3_BUCKET = process.env.S3_BUCKET;

const REPORT_URI = process.env.REPORT_URI;

const FALLBACK_CSP = process.env.FALLBACK_CSP;

export const handler = async (
    event: CloudFrontResponseEvent
): Promise<CloudFrontResponse> => {
    console.log("Lambda@Edge handler invoked");

    const response = event.Records[0].cf.response;
    response.headers = response.headers || {};

    let csp = '';

    if (REPORT_URI) {
        response.headers["reporting-endpoints"] = [
            { key: "Reporting-Endpoints", value: `report_endpoint="${REPORT_URI}"` }
        ]

        // Add both report-to and report-uri for backwards compatibility
        csp += `report-uri ${REPORT_URI}; report-to report_endpoint; `;
        console.log(`Added report uri to csp: ${csp}`);
    }

    try {
        if (!CSP_OBJECT || !S3_BUCKET) {
            throw new Error("CSP_FILE or S3_BUCKET environment variable is missing");
        }

        console.log("Reading CSP file from S3");

        const params: S3.GetObjectRequest = {
            Bucket: S3_BUCKET,
            Key: CSP_OBJECT,
        };

        const s3Object = await s3.getObject(params).promise();

        if (!s3Object.Body) {
            throw new Error("CSP file is empty or missing");
        }

        csp += s3Object.Body.toString("utf-8");

        console.log("CSP file retrieved:", csp);

        response.headers["content-security-policy"] = [
            { key: "Content-Security-Policy", value: csp },
        ];

        console.log("CSP header added");
    } catch (error) {
        console.error("Error fetching CSP file or adding header:", error);

        // If no fallback was provided, throw the error and 500 response
        if (!FALLBACK_CSP) throw error;

        response.headers["content-security-policy"] = [

        ]
        throw error;
    }

    return response;
};
