import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { StringListParameter } from "aws-cdk-lib/aws-ssm";

/**
 * An interface representing a mapping of URLs to an array of associated tokens.
 */
interface TokenUrlAssociation {
  [url: string]: string[];
}

/**
 * Interface for associating a token with a URL for prerendering.
 */
export interface PrerenderTokenUrlAssociation extends StackProps {
  /**
   * Object containing the token and its associated URL.
   */
  tokenUrlAssociation: TokenUrlAssociation;
  /**
   * Prefix for the SSM parameter path where the token value is stored.
   */
  ssmPathPrefix: string;
}

/**
 * This is used for managing prerender tokens in prerender re-caching.
 * It takes a mapping between URLs and prerender tokens as input, and
 * creates an SSM parameter for each token that contains a list of domain
 * names associated with the token.
 * The constructor loops through the tokenUrlAssociation object and
 * creates an SSM parameter for each token.
 */
export class PrerenderTokensUrlAssociation extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: PrerenderTokenUrlAssociation
  ) {
    super(scope, id, props);

    const { tokenUrlAssociation, ssmPathPrefix } = props;

    // Loop through the tokenDomains
    for (const [token, domains] of Object.entries(tokenUrlAssociation)) {
      // Create an SSM parameter for each token
      new StringListParameter(this, `prerender-${domains[0]}`, {
        parameterName: `${ssmPathPrefix.replace(/\/$/, "")}/${token}`,
        stringListValue: domains,
      });
    }
  }
}
