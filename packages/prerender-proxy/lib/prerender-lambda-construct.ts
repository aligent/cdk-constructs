import { Construct, CfnOutput } from '@aws-cdk/core';
import { PrerenderFunction } from './prerender-construct';
import { PrerenderCheckFunction } from './prerender-check-construct';
import { ErrorResponseFunction } from './error-response-construct';
import { CloudFrontCacheControl, CloudFrontCacheControlOptions } from "./prerender-cf-cache-control-construct";

export interface PrerenderLambdaProps {
    prerenderToken: string
    exclusionExpression?: string
    cacheControlProps?: CloudFrontCacheControlOptions
}

export class PrerenderLambda extends Construct {

  readonly  prerenderCheckFunction:PrerenderCheckFunction
  readonly  prerenderFunction:PrerenderFunction
  readonly  errorResponseFunction:ErrorResponseFunction
  readonly  cacheControlFunction:CloudFrontCacheControl

  constructor(scope: Construct, id: string, props: PrerenderLambdaProps) {
    super(scope, id);

    this.prerenderCheckFunction = new PrerenderCheckFunction(this, 'PrerenderViewerRequest');
   
    this.prerenderFunction = new PrerenderFunction(this, 'PrerenderOriginRequest', props);
    
    this.errorResponseFunction = new ErrorResponseFunction(this, 'ErrorResponse', {});

    this.cacheControlFunction = new CloudFrontCacheControl(this, 'PrerenderCloudFrontCacheControl', props.cacheControlProps)
  }
}
