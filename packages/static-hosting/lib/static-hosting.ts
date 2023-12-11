import { Construct } from "constructs";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  Distribution,
  DistributionProps,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  SSLMethod,
  ViewerProtocolPolicy,
  BehaviorOptions,
  ErrorResponse,
  EdgeLambda,
  CfnDistribution,
  OriginRequestPolicy,
  CachePolicy,
  OriginRequestHeaderBehavior,
  CacheHeaderBehavior,
  IResponseHeadersPolicy,
  LambdaEdgeEventType,
  OriginAccessIdentity,
  IDistribution,
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

export interface StaticHostingProps {
  exportPrefix?: string;
  domainName: string;
  subDomainName: string;
  certificateArn: string;
  createDnsRecord?: boolean;
  createPublisherGroup?: boolean;
  createPublisherUser?: boolean;
  extraDistributionCnames?: ReadonlyArray<string>;
  enableCloudFrontAccessLogging?: boolean;
  enableS3AccessLogging?: boolean;
  zoneName?: string;
  enableErrorConfig?: boolean;
  enableStaticFileRemap?: boolean;
  remapPaths?: remapPath[];
  backendHost?: string;
  remapBackendPaths?: remapPath[];
  defaultRootObject?: string;
  enforceSSL?: boolean;

  /**
   * Disable the use of the CSP header. Default value is false.
   */
  disableCSP?: boolean;

  /**
   * AWS limits the max header size to 1kb, this is too small for complex csp headers.
   * The main purpose of this csp header is to provide a method of setting a report-uri.
   */
  csp?: CSP;

  /**
   * This will generate a csp based *purely* on the provided csp object.
   * Therefore disabling the automatic adding of common use-case properties.
   */
  explicitCSP?: boolean;

  /**
   * Extend the default props for S3 bucket
   */
  s3ExtendedProps?: BucketProps;

  /**
   * Optional WAF ARN
   */
  webAclArn?: string;
  responseHeadersPolicies?: ResponseHeaderMappings;
  additionalBehaviors?: Record<string, BehaviorOptions>;
  errorResponsePagePath?: string;
  defaultBehaviorEdgeLambdas?: EdgeLambda[];

  /**
   * After switching constructs, you need to maintain the same logical ID
   * for the underlying CfnDistribution if you wish to avoid the deletion
   * and recreation of your distribution.
   *
   * To do this, use escape hatches to override the logical ID created by
   * the new Distribution construct with the logical ID created by the
   * old construct
   *
   * https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_cloudfront-readme.html#migrating-from-the-original-cloudfrontwebdistribution-to-the-newer-distribution-construct.
   */
  overrideLogicalId?: string;

  /**
   * A Request policy used on the default behavior
   */
  defaultBehaviorRequestPolicy?: OriginRequestPolicy;

  /**
   * A Cache policy used on the default behavior
   */
  defaultBehaviorCachePolicy?: CachePolicy;
}

interface remapPath {
  from: string;
  to: string;
}

export interface ResponseHeaderMappings {
  defaultBehaviorResponseHeaderPolicy?: ResponseHeadersPolicy;
  additionalBehaviorResponsePolicy?: Record<string, ResponseHeadersPolicy>;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export class StaticHosting extends Construct {
  public readonly distribution: IDistribution;
  public readonly bucket: IBucket;

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
    const defaultRootObject = props.defaultRootObject ?? "/index.html";
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

    const oai = new OriginAccessIdentity(this, "OriginAccessIdentity", {
      comment: "Allow CloudFront to access S3",
    });

    this.bucket.grantRead(oai);

    new CfnOutput(this, "Bucket", {
      description: "BucketName",
      value: this.bucket.bucketName,
      exportName: `${exportPrefix}BucketName`,
    });

    const publisherUser = props.createPublisherUser
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

    const publisherGroup = props.createPublisherGroup
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
        })
      : undefined;

    if (loggingBucket) {
      loggingBucket.grantWrite(oai);

      new CfnOutput(this, "LoggingBucketName", {
        description: "CloudFront Logs",
        value: loggingBucket.bucketName,
        exportName: `${exportPrefix}LoggingBucketName`,
      });
    }

    const s3Origin = new S3Origin(this.bucket, {
      originAccessIdentity: oai,
    });
    let backendOrigin = undefined;

    const originRequestPolicy =
      props.defaultBehaviorRequestPolicy ||
      new OriginRequestPolicy(this, "S3OriginRequestPolicy", {
        headerBehavior:
          OriginRequestHeaderBehavior.allowList("x-forwarded-host"),
      });

    const originCachePolicy =
      props.defaultBehaviorCachePolicy ||
      new CachePolicy(this, "S3OriginCachePolicy", {
        headerBehavior: CacheHeaderBehavior.allowList("x-forwarded-host"),
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

    const defaultBehavior: Writeable<BehaviorOptions> = {
      origin: s3Origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      edgeLambdas: defaultBehaviorEdgeLambdas,
      originRequestPolicy: originRequestPolicy,
      cachePolicy: originCachePolicy,
      responseHeadersPolicy: responseHeadersPolicy,
    };

    const additionalBehaviors: Record<string, Writeable<BehaviorOptions>> = {};

    if (props.backendHost) {
      backendOrigin = new HttpOrigin(props.backendHost);

      if (props.remapBackendPaths) {
        for (const path of props.remapBackendPaths) {
          additionalBehaviors[path.from] = {
            origin: backendOrigin,
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            edgeLambdas: this.createRemapBehavior(path.from, path.to),
          };
        }
      }
    }

    if (enableStaticFileRemap) {
      for (const path of this.staticFiles) {
        additionalBehaviors[`*.${path}`] = {
          origin: s3Origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        };
      }
    }

    // Note: A given path may override if the same path is defined both remapPaths and remapBackendPaths. This is an
    // unlikely scenario but worth noting. e.g. `/robots.txt` should be defined in one of the above but not both.
    if (props.remapPaths) {
      for (const path of props.remapPaths) {
        additionalBehaviors[path.from] = {
          origin: s3Origin,
          edgeLambdas: this.createRemapBehavior(path.from, path.to),
        };
      }
    }

    if (props.responseHeadersPolicies?.defaultBehaviorResponseHeaderPolicy) {
      defaultBehavior.responseHeadersPolicy =
        props.responseHeadersPolicies.defaultBehaviorResponseHeaderPolicy;
    }

    if (props.responseHeadersPolicies?.additionalBehaviorResponsePolicy) {
      for (const path in props.responseHeadersPolicies
        .additionalBehaviorResponsePolicy) {
        additionalBehaviors[path].responseHeadersPolicy =
          props.responseHeadersPolicies.additionalBehaviorResponsePolicy[path];
      }
    }

    // If additional behaviours are provided via props, then merge, overriding generated behaviours if required.
    if (props.additionalBehaviors) {
      Object.assign(additionalBehaviors, props.additionalBehaviors);
    }

    const distributionProps: DistributionProps = {
      domainNames: domainNames,
      webAclId: props.webAclArn,
      defaultRootObject: defaultRootObject,
      httpVersion: HttpVersion.HTTP3,
      sslSupportMethod: SSLMethod.SNI,
      priceClass: PriceClass.PRICE_CLASS_ALL,
      enableLogging: props.enableCloudFrontAccessLogging,
      logBucket: props.enableCloudFrontAccessLogging
        ? loggingBucket
        : undefined,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2018,
      certificate: Certificate.fromCertificateArn(
        this,
        "DomainCertificate",
        props.certificateArn
      ),
      defaultBehavior: defaultBehavior,
      additionalBehaviors: additionalBehaviors,
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

      const cloudFrontInvalidationPolicy = new Policy(
        this,
        "CloudFrontInvalidationPolicy",
        {
          groups: [publisherGroup],
          statements: [cloudFrontInvalidationPolicyStatement],
        }
      );
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

    if (props.createDnsRecord && props.zoneName) {
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

  private createRemapBehavior(from: string, to: string): EdgeLambda[] {
    const lambdas: EdgeLambda[] = [];

    // If the remap is to a different path, create a Lambda@Edge function to handle this
    if (from !== to) {
      // Remove special characters from path
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
