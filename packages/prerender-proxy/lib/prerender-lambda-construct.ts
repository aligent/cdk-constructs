import { Construct } from "constructs";
import {
  CloudFrontCacheControl,
  CloudFrontCacheControlOptions,
} from "./prerender-cf-cache-control-construct";
import {
  PrerenderCheckFunction,
  PrerenderCheckOptions,
} from "./prerender-check-construct";
import {
  PrerenderFunction,
  PrerenderFunctionOptions,
} from "./prerender-construct";
import {
  ErrorResponseFunction,
  ErrorResponseFunctionOptions,
} from "./error-response-construct";

export interface PrerenderLambdaProps {
  prerenderProps: PrerenderFunctionOptions;
  errorResponseProps: ErrorResponseFunctionOptions;
  prerenderCheckOptions?: PrerenderCheckOptions;
  cacheControlProps?: CloudFrontCacheControlOptions;
}

export class PrerenderLambda extends Construct {
  readonly prerenderCheckFunction: PrerenderCheckFunction;
  readonly prerenderFunction: PrerenderFunction;
  readonly errorResponseFunction: ErrorResponseFunction;
  readonly cacheControlFunction: CloudFrontCacheControl;

  constructor(scope: Construct, id: string, props: PrerenderLambdaProps) {
    super(scope, id);

    this.prerenderCheckFunction = new PrerenderCheckFunction(
      this,
      `${id}-PrerenderViewerRequest`,
      props.prerenderCheckOptions
    );

    this.prerenderFunction = new PrerenderFunction(
      this,
      `${id}-PrerenderOriginRequest`,
      props.prerenderProps
    );

    this.errorResponseFunction = new ErrorResponseFunction(
      this,
      `${id}-ErrorResponse`,
      props.errorResponseProps
    );

    this.cacheControlFunction = new CloudFrontCacheControl(
      this,
      `${id}-PrerenderCloudFrontCacheControl`,
      props.cacheControlProps
    );
  }
}
