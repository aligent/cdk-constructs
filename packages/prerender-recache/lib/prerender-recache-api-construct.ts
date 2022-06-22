import { Construct } from 'constructs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Bundling } from 'aws-cdk-lib/aws-lambda-nodejs/lib/bundling';
import { LambdaToSqsToLambda } from "@aws-solutions-constructs/aws-lambda-sqs-lambda";


export interface PrerenderRecacheApiOptions {
    prerenderS3Bucket: string
}

export class PrerenderRecacheApi extends Construct {
    readonly api: LambdaRestApi;

    constructor(scope: Construct, id: string, options: PrerenderRecacheApiOptions) {
        super(scope, id);

        const handler = new lambda.Function(this, 'prerenderRecacheApiHandler', {
            code: Bundling.bundle({
                entry: `${__dirname}/handlers/prerender-recache-handler.ts`,
                runtime: lambda.Runtime.NODEJS_16_X,
                sourceMap: false,
                projectRoot: `${__dirname}/handlers/`,
                depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
                architecture: lambda.Architecture.X86_64
            }),
            runtime: lambda.Runtime.NODEJS_16_X,
            handler: 'prerender-recache-handler.handler'
        });

        handler.addEnvironment('PRERENDER_CACHE_BUCKET', options.prerenderS3Bucket);

        this.api = new LambdaRestApi(this, 'prerenderRecacheApi', {
            handler,
            proxy: false
        });

        const recache = this.api.root.addResource('recache');
        recache.addMethod('POST');


        const requestHandlerCode = Bundling.bundle({
            entry: `${__dirname}/handlers/prerender-recache-request.ts`,
            runtime: lambda.Runtime.NODEJS_16_X,
            sourceMap: false,
            projectRoot: `${__dirname}/handlers/`,
            depsLockFilePath: `${__dirname}/handlers/package-lock.json`,
            architecture: lambda.Architecture.X86_64
        });

        const requestQueueAndHandler = new LambdaToSqsToLambda(this, 'prerenderRequestQueue', {
            existingProducerLambdaObj: handler,
            consumerLambdaFunctionProps: {
                runtime: lambda.Runtime.NODEJS_16_X,
                handler: 'prerender-recache-request.handler',
                code: requestHandlerCode
            },
            deployDeadLetterQueue: false
        });
    }
}