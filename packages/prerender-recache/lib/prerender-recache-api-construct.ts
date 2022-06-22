import { Construct } from 'constructs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { LambdaToSqsToLambda } from "@aws-solutions-constructs/aws-lambda-sqs-lambda";
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';


export interface PrerenderRecacheApiOptions {
    prerenderS3Bucket: string,
    apiKeys: string[]
}

export class PrerenderRecacheApi extends Construct {
    readonly api: LambdaRestApi;

    constructor(scope: Construct, id: string, options: PrerenderRecacheApiOptions) {
        super(scope, id);

        const apiHandler = createApiLambdaFunction(this, options);
        
        this.api = new LambdaRestApi(this, 'prerenderRecacheApi', {
            handler: apiHandler,
            proxy: false
        });

        options.apiKeys.forEach(k => this.api.addApiKey(k));

        const recache = this.api.root.addResource('recache');
        recache.addMethod('POST');

        new LambdaToSqsToLambda(this, 'prerenderRequestQueue', {
            existingProducerLambdaObj: apiHandler,
            existingConsumerLambdaObj: new NodejsFunction(this, 'consumer'),
            deployDeadLetterQueue: false
        });
    }
}

const createApiLambdaFunction = (scope: Construct, options: PrerenderRecacheApiOptions): NodejsFunction => {
    const apiHandler = new NodejsFunction(scope, 'api');

    apiHandler.addEnvironment('PRERENDER_CACHE_BUCKET', options.prerenderS3Bucket);

    const ssmGetParameterPolicy = new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: ['*']
    }) // should be arn:aws:ssm:::parameter/prerender/recache/tokens/*, but can't make that work

    const ssmDescribeParameterPolicy = new iam.PolicyStatement({
        actions: ['ssm:DescribeParameters'],
        resources: ['*']
    });

    apiHandler.addToRolePolicy(ssmGetParameterPolicy);
    apiHandler.addToRolePolicy(ssmDescribeParameterPolicy);

    return apiHandler;
}