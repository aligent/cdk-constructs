import { Construct } from "constructs";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  BehaviorOptions,
  CacheHeaderBehavior,
  CachePolicy,
  CfnDistribution,
  Distribution,
  DistributionProps,
  EdgeLambda,
  ErrorResponse,
  HttpVersion,
  IDistribution,
  IResponseHeadersPolicy,
  IOriginAccessIdentity,
  LambdaEdgeEventType,
  OriginAccessIdentity,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersCorsBehavior,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  SSLMethod,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  Effect,
  Group,
  Policy,
  PolicyStatement,
  User,
} from "aws-cdk-lib/aws-iam";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  BucketProps,
  IBucket,
} from "aws-cdk-lib/aws-s3";
import { CSP } from "../types/csp";
import { PathRemapFunction } from "./path-remap";
import { RequestFunction, ResponseFunction } from "./csp";

export interface StaticHostingProps {
  /**
   * Domain name for the stack. Combined with the subDomainName it is used as
   * the name for the S3 origin and an alternative domain name for the
   * CloudFront distribution
   */
  domainName: string;

  /**
   * Subdomain name for the stack. Combined with the domainName it is used as
   * the name for the S3 origin and an alternative domain name for the
   * CloudFront distribution
   */
  subDomainName: string;

  /**
   * CORS configuration for the CloudFront distribution.
   * If set, creates a ResponseHeadersPolicy with CORS configuration that is
   * automatically applied to all static file behaviors (*.js, *.css, etc.),
   * remapPaths, remapBackendPaths, and the default behavior.
   *
   * Uses the CDK ResponseHeadersCorsBehavior type. Only `accessControlAllowOrigins`
   * is required. Other settings have sensible defaults:
   * - accessControlAllowCredentials: false
   * - accessControlAllowHeaders: ['*']
   * - accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS']
   * - originOverride: true
   *
   * @example
   * // Simple usage - just origins
   * corsConfig: {
   *   accessControlAllowOrigins: ['https://example.com', 'https://app.example.com']
   * }
   *
   * @example
   * // Full customisation
   * corsConfig: {
   *   accessControlAllowOrigins: ['https://example.com'],
   *   accessControlAllowCredentials: true,
   *   accessControlAllowHeaders: ['Content-Type', 'Authorization'],
   *   accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
   *   accessControlExposeHeaders: ['X-Custom-Header'],
   *   accessControlMaxAge: Duration.seconds(600),
   *   originOverride: false
   * }
   *
   * @default undefined - no CORS policy will be applied
   */
  corsConfig?: Partial<ResponseHeadersCorsBehavior> &
    Pick<ResponseHeadersCorsBehavior, "accessControlAllowOrigins">;

  /**
   * Whether the site should be indexable by search engines.
   * When set to false, adds x-robots-tag: noindex,nofollow header to the default behavior.
   * If corsConfig is also provided, the CORS configuration will be combined with
   * the noindex/nofollow headers.
   *
   * Use this for staging/feature environments that should not appear in search results.
   *
   * @default true - site is indexable
   */
  indexable?: boolean;

  /**
   * An array of additional Cloudfront alternative domain names.
   *
   * @default undefined
   */
  extraDistributionCnames?: ReadonlyArray<string>;

  /**
   * The arn of the certificate to attach to the CloudFront distribution.
   * Must be created in us-east-1
   */
  certificateArn: string;

  /**
   * Custom backend host to add as a second origin to the CloudFront distribution
   *
   * @default undefined
   */
  backendHost?: string;

  /**
   * The hosted zone name to create a DNS record in.
   * If not supplied a DNS record will not be created
   *
   * @default undefined
   */
  zoneName?: string;

  /**
   * Whether to create a group with permissions to publish to the S3 bucket.
   *
   * @default true
   */
  createPublisherGroup?: boolean;

  /**
   * Whether to create a user with permissions to publish to the S3 bucket.
   * The user will not have permissions unless the publisher group is also created
   *
   * @default true
   */
  createPublisherUser?: boolean;

  /**
   * Enable CloudFront access logs
   *
   * @default false
   */
  enableCloudFrontAccessLogging?: boolean;

  /**
   * Number of days to retain CloudFront access logs before deletion.
   * Only applies when enableCloudFrontAccessLogging is true.
   * Set to a positive number to enable automatic deletion.
   *
   * @default undefined (logs retained indefinitely)
   */
  cloudFrontLogRetentionDays?: number;

  /**
   * Enable S3 access logging
   *
   * @default false
   */
  enableS3AccessLogging?: boolean;

  /**
   * Enable returning the errorResponsePagePath on a 404.
   * Not required when using Prerender or Feature environment Lambda@Edge functions
   *
   * @default false
   */
  enableErrorConfig?: boolean;

  /**
   * Custom error response page path
   *
   * @default /index.html
   */
  errorResponsePagePath?: string;

  /**
   * Create behaviours for the following file extensions to route straight to the S3 origin
   * js, css, json, svg, jpg, jpeg, png, gif, ico, woff, woff2, otf
   *
   * @default true
   */
  enableStaticFileRemap?: boolean;

  /**
   * Overrides default behaviour paths with a prefix and takes in behviour options to apply on the prefix behaviour
   *
   * @default true
   */
  defaultBehaviourPrefixes?: {
    prefix: string;
    behaviourOverride: Partial<BehaviorOptions>;
  }[];

  /**
   * Optional additional properties for static file remap behaviours
   *
   * @default none
   */
  staticFileRemapOptions?: Partial<BehaviorOptions>;

  /**
   * Paths to remap on the default behaviour. For example you might remap deployed_sitemap.xml -> sitemap.xml
   * Created a behaviour in CloudFront to handle the remap. If the paths are different
   * it will also deploy a Lambda@Edge function to perform the required remap.
   * The "to" path is optional, and the Lambda@Edge function will not be deployed if not provided.
   *
   * @default undefined
   */
  remapPaths?: remapPath[];

  /**
   * Functions the same as remapPaths but uses the backendHost as the origin.
   * Requires a valid backendHost to be configured
   *
   * @see remapPaths
   * @default undefined
   */
  remapBackendPaths?: remapPath[];

  /**
   * Override the default root object
   *
   * @default index.html
   */
  defaultRootObject?: string;

  /**
   * Enforce ssl on bucket requests
   *
   * @default true
   */
  enforceSSL?: boolean;

  /**
   * Disable the use of the CSP header
   *
   * @default false
   */
  disableCSP?: boolean;

  /**
   * Adds custom CSP directives and URLs to the header.
   *
   * AWS limits the max header size to 1kb, this is too small for complex csp headers.
   * The main purpose of this csp header is to provide a method of setting a report-uri.
   *
   * For more complex CSP headers, it's recommended to use the cspPath property to apply
   * a CSP header to specific paths.
   *
   * @default undefined
   */
  csp?: CSP;

  /**
   * This will generate a csp based *purely* on the provided csp object.
   * Therefore disabling the automatic adding of common use-case properties.
   *
   * @default false
   */
  explicitCSP?: boolean;

  /**
   * Extend the default props for S3 bucket
   *
   * @default undefined
   */
  s3ExtendedProps?: BucketProps;

  /**
   * Add an external WAF via an arn
   *
   * @default undefined
   */
  webAclArn?: string;

  /**
   * Add response headers policies to the default behaviour
   *
   * @default undefined
   */
  responseHeadersPolicies?: ResponseHeaderMappings;

  /**
   * Additional behaviours
   *
   * @default undefined
   */
  additionalBehaviors?: Record<string, BehaviorOptions>;

  /**
   * Lambda@Edge functions to add to the default behaviour
   *
   * @default undefined
   */
  defaultBehaviorEdgeLambdas?: EdgeLambda[];

  /**
   * A request policy used on the default behavior
   *
   * @default undefined
   */
  defaultBehaviorRequestPolicy?: OriginRequestPolicy;

  /**
   * A cache policy used on the default behavior
   *
   * @default undefined
   */
  defaultBehaviorCachePolicy?: CachePolicy;

  /**
   * Additional headers to include in OriginRequestHeaderBehavior
   */
  additionalDefaultOriginRequestHeaders?: string[];

  /**
   * Additional headers to include in CacheHeaderBehavior
   */
  additionalDefaultCacheKeyHeaders?: string[];

  /**
   * After switching constructs, you need to maintain the same logical ID
   * for the underlying CfnDistribution if you wish to avoid the deletion
   * and recreation of your distribution.
   *
   * To do this, use escape hatches to override the logical ID created by
   * the new Distribution construct with the logical ID created by the
   * old construct
   *
   * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#migrating-from-the-original-cloudfrontwebdistribution-to-the-newer-distribution-construct.
   * @default undefined
   */
  overrideLogicalId?: string;

  /**
   * A string to prefix CloudFormation outputs with
   *
   * @default undefined
   */
  exportPrefix?: string;

  /**
   * Add a comment to the CloudFront distribution
   *
   * @default undefined
   */
  comment?: string;

  /**
   * Configuration settings for CSP at a specific path
   * If a value is passed through, CSP will be enabled for the given path
   */
  cspPaths?: CSPConfig[];
}

export interface CSPConfig {
  /**
   * Path to apply the CSP behaviour and also the path
   */
  path: string;

  /**
   * Optional path to a different index.html in the bucket. Will default to the path provided
   * for the behaviour
   */
  indexPath?: string;

  /**
   * URI to send CSP reports to. Adds to a reporting endpoint called report_endpoint:
   * `Reporting-Endpoints: report_endpoint="${reportURI}"`
   */
  reportUri: string;

  /**
   * An optional CSP to fallback to in the event that the CSP from the S3 bucket cannot
   * be retrieved or parsed
   */
  fallbackCsp?: string;

  /**
   * File containing CSP rules. Default: `csp.txt`
   */
  cspObject?: string;
}

export interface remapPath {
  from: string;
  to?: string;
  behaviour?: Partial<BehaviorOptions>;
}

export interface ResponseHeaderMappings {
  defaultBehaviorResponseHeaderPolicy?: ResponseHeadersPolicy;
  additionalBehaviorResponsePolicy?: Record<string, ResponseHeadersPolicy>;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export class StaticHosting extends Construct {
  public readonly distribution: IDistribution;
  public readonly bucket: IBucket;
  public readonly oai: IOriginAccessIdentity;
  public readonly corsResponseHeadersPolicy?: ResponseHeadersPolicy;

  private staticFiles = [
    "js",
    "css",
    "json",
    "svg",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "ico",
    "woff",
    "woff2",
    "otf",
  ];

  constructor(scope: Construct, id: string, props: StaticHostingProps) {
    super(scope, id);

    const exportPrefix = props.exportPrefix
      ? props.exportPrefix
      : "StaticHosting";

    const siteName = `${props.subDomainName}.${props.domainName}`;
    const siteNameArray: Array<string> = [siteName];
    const enforceSSL = props.enforceSSL !== false;
    const enableStaticFileRemap = props.enableStaticFileRemap !== false;
    const defaultRootObject = props.defaultRootObject ?? "index.html";
    const errorResponsePagePath = props.errorResponsePagePath ?? "/index.html";
    const defaultBehaviorEdgeLambdas = props.defaultBehaviorEdgeLambdas ?? [];
    const disableCSP = props.disableCSP === true;

    const domainNames: Array<string> = props.extraDistributionCnames
      ? siteNameArray.concat(props.extraDistributionCnames)
      : siteNameArray;

    const s3LoggingBucket = props.enableS3AccessLogging
      ? new Bucket(this, "S3LoggingBucket", {
          bucketName: `${siteName}-s3-access-logs`,
          encryption: BucketEncryption.S3_MANAGED,
          blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
          removalPolicy: RemovalPolicy.RETAIN,
          enforceSSL: enforceSSL,
        })
      : undefined;

    if (s3LoggingBucket) {
      new CfnOutput(this, "S3LoggingBucketName", {
        description: "S3 Logs",
        value: s3LoggingBucket.bucketName,
        exportName: `${exportPrefix}S3LoggingBucketName`,
      });
    }

    this.bucket = new Bucket(this, "ContentBucket", {
      bucketName: siteName,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: s3LoggingBucket,
      enforceSSL: enforceSSL,
      ...props.s3ExtendedProps,
    });

    this.oai = new OriginAccessIdentity(this, "OriginAccessIdentity", {
      comment: "Allow CloudFront to access S3",
    });

    this.bucket.grantRead(this.oai);

    new CfnOutput(this, "Bucket", {
      description: "BucketName",
      value: this.bucket.bucketName,
      exportName: `${exportPrefix}BucketName`,
    });

    const publisherUser =
      props.createPublisherUser !== false
        ? new User(this, "PublisherUser", {
            userName: `publisher-${siteName}`,
          })
        : undefined;

    if (publisherUser) {
      new CfnOutput(this, "PublisherUserName", {
        description: "PublisherUser",
        value: publisherUser.userName,
        exportName: `${exportPrefix}PublisherUser`,
      });
    }

    const publisherGroup =
      props.createPublisherGroup !== false
        ? new Group(this, "PublisherGroup")
        : undefined;

    if (publisherGroup) {
      this.bucket.grantReadWrite(publisherGroup);

      new CfnOutput(this, "PublisherGroupName", {
        description: "PublisherGroup",
        value: publisherGroup.groupName,
        exportName: `${exportPrefix}PublisherGroup`,
      });

      if (publisherUser) {
        publisherGroup.addUser(publisherUser);
      }
    }

    const loggingBucket = props.enableCloudFrontAccessLogging
      ? new Bucket(this, "LoggingBucket", {
          bucketName: `${siteName}-access-logs`,
          encryption: BucketEncryption.S3_MANAGED,
          blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
          removalPolicy: RemovalPolicy.RETAIN,
          enforceSSL: enforceSSL,
          lifecycleRules:
            props.cloudFrontLogRetentionDays &&
            props.cloudFrontLogRetentionDays > 0
              ? [
                  {
                    enabled: true,
                    expiration: Duration.days(props.cloudFrontLogRetentionDays),
                  },
                ]
              : undefined,
        })
      : undefined;

    if (loggingBucket) {
      loggingBucket.grantWrite(this.oai);

      new CfnOutput(this, "LoggingBucketName", {
        description: "CloudFront Logs",
        value: loggingBucket.bucketName,
        exportName: `${exportPrefix}LoggingBucketName`,
      });
    }

    const s3Origin = new S3Origin(this.bucket, {
      originAccessIdentity: this.oai,
    });
    let backendOrigin = undefined;

    const additionalDefaultOriginRequestHeaders =
      props.additionalDefaultOriginRequestHeaders || [];
    const originRequestHeaderBehaviorAllowList = [
      "x-forwarded-host", // Consumed by OriginRequest Lambda@Edge for Feature Environment functionality.
      "x-request-prerender", // Consumed by OriginRequest Lambda@Edge to determine if this request needs to be send to Prerender service rather than other origins.
      "x-prerender-host", // Consumed by OriginRequest Lambda@Edge, only when x-request-prerender header is set. Prerender service will send request to this host.
      "x-prerender", // Consumed, if configured, by origin's custom features, such as GeoRedirection, the behave of which should depend on whether the request is from an end user.
      "x-prerender-user-agent", // Consumed by Prerender service for logging original user agent rather than CloudFront's
      ...additionalDefaultOriginRequestHeaders,
    ];
    const originRequestPolicy =
      props.defaultBehaviorRequestPolicy ||
      new OriginRequestPolicy(this, "S3OriginRequestPolicy", {
        headerBehavior: OriginRequestHeaderBehavior.allowList(
          ...originRequestHeaderBehaviorAllowList
        ),
      });

    const additionalDefaultCacheKeyHeaders =
      props.additionalDefaultCacheKeyHeaders || [];
    const cacheHeaderBehaviorAllowList = [
      "x-forwarded-host", // Origin response may vary depending on the domain/path based on Feature Environment
      "x-prerender", // Origin response may vary depending on whether the request is from end user or prerender service.
      ...additionalDefaultCacheKeyHeaders,
    ];
    const originCachePolicy =
      props.defaultBehaviorCachePolicy ||
      new CachePolicy(this, "S3OriginCachePolicy", {
        headerBehavior: CacheHeaderBehavior.allowList(
          ...cacheHeaderBehaviorAllowList
        ),
        enableAcceptEncodingBrotli: true,
        enableAcceptEncodingGzip: true,
      });

    const errorResponses: ErrorResponse[] = [
      {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: errorResponsePagePath,
        ttl: Duration.seconds(0),
      },
    ];

    let responseHeadersPolicy: IResponseHeadersPolicy | undefined;

    if (!disableCSP) {
      const cspHeader = this.generateCSPString(props.csp, props.explicitCSP);

      responseHeadersPolicy = new ResponseHeadersPolicy(
        this,
        "ResponseHeaders",
        {
          securityHeadersBehavior: {
            contentSecurityPolicy: {
              contentSecurityPolicy: cspHeader,
              override: true,
            },
          },
        }
      );
    }

    // Create CORS behavior config if corsConfig is specified
    const corsBehavior: ResponseHeadersCorsBehavior | undefined =
      props.corsConfig && props.corsConfig?.accessControlAllowOrigins.length > 0
        ? {
            accessControlAllowCredentials: false,
            accessControlAllowHeaders: ["*"],
            accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
            originOverride: true,
            ...props.corsConfig,
          }
        : undefined;

    // Create standalone CORS policy for use with static files, remapPaths, etc.
    if (corsBehavior) {
      this.corsResponseHeadersPolicy = new ResponseHeadersPolicy(
        this,
        "CORSResponseHeadersPolicy",
        {
          corsBehavior: corsBehavior,
        }
      );
    }

    // Determine the default behavior response headers policy based on indexable and CORS settings
    const indexable = props.indexable !== false; // default to true
    let defaultBehaviorResponsePolicy: IResponseHeadersPolicy | undefined =
      responseHeadersPolicy;

    if (!indexable) {
      // Non-indexable environments get noindex/nofollow header, optionally with CORS
      defaultBehaviorResponsePolicy = new ResponseHeadersPolicy(
        this,
        "NoIndexNoFollowPolicy",
        {
          customHeadersBehavior: {
            customHeaders: [
              {
                header: "x-robots-tag",
                value: "noindex,nofollow",
                override: true,
              },
            ],
          },
          // Include CORS if configured
          corsBehavior: corsBehavior,
        }
      );
    } else if (this.corsResponseHeadersPolicy) {
      // Indexable with CORS - use CORS policy for default behavior
      defaultBehaviorResponsePolicy = this.corsResponseHeadersPolicy;
    }

    const defaultBehavior: Writeable<BehaviorOptions> = {
      origin: s3Origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      edgeLambdas: defaultBehaviorEdgeLambdas,
      originRequestPolicy,
      cachePolicy: originCachePolicy,
      responseHeadersPolicy: defaultBehaviorResponsePolicy,
    };

    const additionalBehaviors: Record<string, Writeable<BehaviorOptions>> = {};

    // If additional behaviours are provided via props, then merge, overriding generated behaviours if required.
    if (props.additionalBehaviors) {
      Object.assign(additionalBehaviors, props.additionalBehaviors);
    }

    if (props.backendHost) {
      backendOrigin = new HttpOrigin(props.backendHost);

      if (props.remapBackendPaths) {
        for (const path of props.remapBackendPaths) {
          additionalBehaviors[path.from] = {
            origin: backendOrigin,
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            edgeLambdas: this.createRemapBehavior(path.from, path.to),
            // Apply CORS policy if configured and not overridden by path.behaviour
            ...(this.corsResponseHeadersPolicy && {
              responseHeadersPolicy: this.corsResponseHeadersPolicy,
            }),
            ...path.behaviour,
          };
        }
      }
    }

    const cspPaths = props.cspPaths || [];
    const cspRemapPaths = cspPaths.map(cspPath => {
      const { path, indexPath, reportUri, fallbackCsp, cspObject } = cspPath;

      const requestFunction = new RequestFunction(
        this,
        `AlternativePathFunction-${path}`,
        {
          pathPrefix: indexPath || path,
        }
      );

      const responseFunction = new ResponseFunction(
        this,
        `CSPFunction-${path}`,
        {
          bucket: `${props.subDomainName}.${props.domainName}`,
          reportUri,
          fallbackCsp,
          bucketRegion: this.bucket.env.region,
          cspObject,
        }
      );
      this.bucket.grantRead(responseFunction.edgeFunction);

      const remap: remapPath = {
        from: path,
        behaviour: {
          edgeLambdas: [
            {
              eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
              functionVersion: requestFunction.edgeFunction.currentVersion,
            },
            {
              eventType: LambdaEdgeEventType.ORIGIN_RESPONSE,
              functionVersion: responseFunction.edgeFunction.currentVersion,
            },
          ],
        },
      };

      return remap;
    });
    if (props.remapPaths) props.remapPaths.push(...cspRemapPaths);
    else props.remapPaths = cspRemapPaths;

    // Note: A given path may override if the same path is defined both remapPaths and remapBackendPaths. This is an
    // unlikely scenario but worth noting. e.g. `/robots.txt` should be defined in one of the above but not both.
    if (props.remapPaths) {
      for (const path of props.remapPaths) {
        additionalBehaviors[path.from] = {
          origin: s3Origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          edgeLambdas: this.createRemapBehavior(path.from, path.to),
          // Apply CORS policy if configured and not overridden by path.behaviour
          ...(this.corsResponseHeadersPolicy && {
            responseHeadersPolicy: this.corsResponseHeadersPolicy,
          }),
          ...path.behaviour,
        };
      }
    }

    if (enableStaticFileRemap) {
      const staticFileRemapPrefixes = props.defaultBehaviourPrefixes?.map(
        prefix => `${prefix.prefix}/`
      ) || [""];
      staticFileRemapPrefixes.forEach(prefix => {
        this.staticFiles.forEach(path => {
          additionalBehaviors[`${prefix}*.${path}`] = {
            origin: s3Origin,
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            // Apply CORS policy to static file behaviors if configured
            ...(this.corsResponseHeadersPolicy && {
              responseHeadersPolicy: this.corsResponseHeadersPolicy,
            }),
            ...props.staticFileRemapOptions,
          };
        });
      });
    }

    props.defaultBehaviourPrefixes?.forEach(prefix => {
      additionalBehaviors[`${prefix.prefix}*`] = {
        origin: s3Origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        originRequestPolicy: originRequestPolicy,
        cachePolicy: originCachePolicy,
        responseHeadersPolicy: responseHeadersPolicy,
        ...prefix.behaviourOverride,
      };
    });

    if (props.responseHeadersPolicies?.defaultBehaviorResponseHeaderPolicy) {
      defaultBehavior.responseHeadersPolicy =
        props.responseHeadersPolicies.defaultBehaviorResponseHeaderPolicy;
    }

    if (props.responseHeadersPolicies?.additionalBehaviorResponsePolicy) {
      for (const path in props.responseHeadersPolicies
        .additionalBehaviorResponsePolicy) {
        if (additionalBehaviors[path]) {
          additionalBehaviors[path].responseHeadersPolicy =
            props.responseHeadersPolicies.additionalBehaviorResponsePolicy[
              path
            ];
        }
      }
    }

    const distributionProps: DistributionProps = {
      domainNames,
      webAclId: props.webAclArn,
      comment: props.comment,
      defaultRootObject: defaultRootObject,
      httpVersion: HttpVersion.HTTP2_AND_3,
      sslSupportMethod: SSLMethod.SNI,
      priceClass: PriceClass.PRICE_CLASS_ALL,
      enableLogging: props.enableCloudFrontAccessLogging,
      logBucket: props.enableCloudFrontAccessLogging
        ? loggingBucket
        : undefined,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      certificate: Certificate.fromCertificateArn(
        this,
        "DomainCertificate",
        props.certificateArn
      ),
      defaultBehavior,
      additionalBehaviors,
      errorResponses: props.enableErrorConfig ? errorResponses : [],
    };

    this.distribution = new Distribution(this, "BucketCdn", distributionProps);

    if (props.overrideLogicalId) {
      const cfnDistribution = this.distribution.node
        .defaultChild as CfnDistribution;
      cfnDistribution.overrideLogicalId(props.overrideLogicalId);
    }

    if (publisherGroup) {
      const cloudFrontInvalidationPolicyStatement = new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:ListInvalidations",
        ],
        resources: [
          `arn:aws:cloudfront::*:distribution/${this.distribution.distributionId}`,
        ],
      });

      new Policy(this, "CloudFrontInvalidationPolicy", {
        groups: [publisherGroup],
        statements: [cloudFrontInvalidationPolicyStatement],
      });
    }
    new CfnOutput(this, "DistributionId", {
      description: "DistributionId",
      value: this.distribution.distributionId,
      exportName: `${exportPrefix}DistributionID`,
    });
    new CfnOutput(this, "DistributionDomainName", {
      description: "DistributionDomainName",
      value: this.distribution.distributionDomainName,
      exportName: `${exportPrefix}DistributionName`,
    });

    if (props.zoneName) {
      const zone = HostedZone.fromLookup(this, "Zone", {
        domainName: props.zoneName,
      });

      new ARecord(this, "SiteAliasRecord", {
        recordName: siteName,
        target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
        zone: zone,
      });
    }
  }

  private createRemapBehavior(from: string, to?: string): EdgeLambda[] {
    const lambdas: EdgeLambda[] = [];

    // If the remap is to a different path, create a Lambda@Edge function to handle this
    // Remove special characters from path
    if (to && from.replace(/\*$/, "") !== to) {
      const id = from.replace(/[&/\\#,+()$~%'":*?<>{}]/g, "-");

      const remapFunction = new PathRemapFunction(
        this,
        `remap-function-${id}`,
        { path: to }
      );

      lambdas.push({
        functionVersion: remapFunction.getFunctionVersion(),
        eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
      });
    }

    return lambdas;
  }

  private generateCSPString(csp?: CSP, explicit?: boolean) {
    // Ensure that default-src is always set
    if (!csp) return "";

    const cspEntries = explicit
      ? csp
      : {
          "default-src": [],
          ...csp,
        };

    return Object.entries(cspEntries)
      .reduce((prevCspHeader, [cspType, cspHeaders]) => {
        if (explicit || cspType === "report-uri")
          return `${prevCspHeader} ${cspType} ${cspHeaders.join(" ")};`;

        const typeOptions = ["'self'", "'unsafe-inline'"];
        if (["font-src", "img-src"].includes(cspType))
          typeOptions.push("data:");

        if (process.env.MAGENTO_BACKEND_URL)
          typeOptions.push(process.env.MAGENTO_BACKEND_URL);

        const cspContent = `${cspHeaders.join(" ")} ${typeOptions.join(
          " "
        )}`.trim();

        return `${prevCspHeader} ${cspType} ${cspContent};`;
      }, "")
      .trim();
  }
}
