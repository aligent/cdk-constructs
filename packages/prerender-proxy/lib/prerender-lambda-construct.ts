import { Construct, CfnOutput } from '@aws-cdk/core';
import { PrerenderFunction } from './prerender-construct';
import { PrerenderCheckFunction } from './prerender-check-construct';
import { ErrorResponseFunction } from './error-response-construct';

export interface PrerenderLambdaProps {
    prerenderToken: string
    exclusionExpression?: string
}

export class PrerenderLambda extends Construct {

  readonly  prerenderCheckFunction:PrerenderCheckFunction
  readonly  prerenderFunction:PrerenderFunction
  readonly  errorResponseFunction:ErrorResponseFunction

  constructor(scope: Construct, id: string, props: PrerenderLambdaProps) {
    super(scope, id);

    this.prerenderCheckFunction = new PrerenderCheckFunction(this, 'PrerenderViewerRequest');
   
    this.prerenderFunction = new PrerenderFunction(this, 'PrerenderOriginRequest', props);
    
    this.errorResponseFunction = new ErrorResponseFunction(this, 'ErrorResponse', {});

  }
}
