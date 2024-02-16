import {
  CloudFrontClient,
  CreateInvalidationCommand,
  CreateInvalidationCommandInput,
  CreateInvalidationCommandOutput,
} from "@aws-sdk/client-cloudfront";

const cfClient = new CloudFrontClient();

const PATHS = process.env.PATHS as string;
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID as string;

export const handler = async (): Promise<CreateInvalidationCommandOutput> => {
  const paths = PATHS.split(",");

  const invalidationInput: CreateInvalidationCommandInput = {
    DistributionId: DISTRIBUTION_ID,
    InvalidationBatch: {
      Paths: {
        Quantity: paths.length,
        Items: paths,
      },
      CallerReference: "lambda",
    },
  };

  const command = new CreateInvalidationCommand(invalidationInput);
  return await cfClient.send(command);
};
