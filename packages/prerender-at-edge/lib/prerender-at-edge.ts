import { experimental } from 'aws-cdk-lib/aws-cloudfront'
import { Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Bucket, BlockPublicAccess } from 'aws-cdk-lib/aws-s3'
import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path';
import { AccessKey, User } from 'aws-cdk-lib/aws-iam';

export interface PrerenderFunctionOptions {
    pathPrefix?: string // Passed as an environment variable to the Edge function
    expirationDays: number
}

export class PrerenderAtEdgeLambda extends Construct {
    constructor(scope: Construct, id: string, options: PrerenderFunctionOptions) {
        super(scope, id);

        // Add bucket with lifecycle rule for Prerender storage
        const bucket = new Bucket(this, 'PrerenderBucket', {
            lifecycleRules: [{
                enabled: true,
                expiration: Duration.days(options.expirationDays)
            }],
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        });

        // Configure access to the bucket for the edge function
        const user = new User(this, 'PrerenderAccess');
        bucket.grantReadWrite(user);

        const accessKey = new AccessKey(this, 'PrerenderAccessKey', {
            user: user,
            serial: 1
        });

        // TODO: Pass IAM creds through to the edge function
        // TODO: Pass path prefix through to the edge function

        // Will need to bundle with esbuild manually and pass environment variables through
        // This is a work around until we can bundle as part of the build process
        
        const edgeFunction = new experimental.EdgeFunction(this, `PrerenderAtEdge`, {
            code: Code.fromAsset(`${path.resolve(__dirname)}/handlers/build`),
            runtime: Runtime.NODEJS_16_X,
            handler: 'index.handler'
        });

        /**
        define: {
            'process.env.S3_BUCKET_NAME': JSON.stringify(bucket.bucketName),
            'process.env.AWS_ACCESS_KEY_ID': JSON.stringify(options.awsAccessKey),
            'process.env.AWS_SECRET_ACCESS_KEY': JSON.stringify(options.awsSecretAccessKey),
            `process.env.AWS_REGION': JSON.stringify(options.awsRegion),
            'process.env.PATH_PREFIX': JSON.stringify(options.pathPrefix ?? ''),
          },
        */

        new CfnOutput(this, 'PrerenderFunctionArn', {
            value: edgeFunction.edgeArn
        });
    }
}
