import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
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
    CacheHeaderBehavior
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
    Effect,
    Group,
    Policy,
    PolicyStatement,
    User
} from 'aws-cdk-lib/aws-iam';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
    BlockPublicAccess,
    Bucket,
    BucketEncryption,
    BucketProps
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { CSP } from '../types/csp';

export interface StaticHostingProps {
    exportPrefix?: string;
    enforceSSL?: boolean;
    domainNames: string[];
    disableCSP?: boolean;
    enableS3AccessLogging?: boolean;
    s3ExtendedProps?: BucketProps;
    createPublisherUser?: boolean;
    createPublisherGroup?: boolean;
    enableCloudFrontAccessLogging?: boolean;
    errorResponsePagePath?: string;
    webAclId?: string;
    defaultRootObject?: string;
    certificateArn: string;
    defaultBehaviourEdgeLambdas: EdgeLambda[];
    additionalBehaviors?: Record<string, BehaviorOptions>;
    enableErrorConfig?: boolean;
    overrideLogicalId?: string;
    createDnsRecord?: boolean;
    zoneName?: string;
}

export interface ResponseHeaderMappings {
    header: ResponseHeadersPolicy;
    pathPatterns: string[];
    attachToDefault?: boolean;
}

export class StaticHosting extends Construct {
    constructor(scope: Construct, id: string, props: StaticHostingProps) {
        super(scope, id);

        // Should the stackExportPrefix is empty, 'StaticHosting' should be used as the prefix
        const exportPrefix = props.exportPrefix
            ? props.exportPrefix
            : 'StaticHosting';

        // TODO: What do?
        const siteName = props.domainNames[0];
        const enforceSSL = props.enforceSSL !== false;
        const disableCSP = props.disableCSP === true;

        const s3LoggingBucket = props.enableS3AccessLogging
            ? new Bucket(this, 'S3LoggingBucket', {
                  bucketName: `${siteName}-s3-access-logs`,
                  encryption: BucketEncryption.S3_MANAGED,
                  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                  removalPolicy: RemovalPolicy.RETAIN,
                  enforceSSL: enforceSSL
              })
            : undefined;

        if (s3LoggingBucket) {
            new CfnOutput(this, 'S3LoggingBucketName', {
                description: 'S3 Logs',
                value: s3LoggingBucket.bucketName,
                exportName: `${exportPrefix}S3LoggingBucketName`
            });
        }

        const bucket = new Bucket(this, 'ContentBucket', {
            bucketName: siteName,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            serverAccessLogsBucket: s3LoggingBucket,
            enforceSSL: enforceSSL,
            ...props.s3ExtendedProps
        });

        new CfnOutput(this, 'Bucket', {
            description: 'BucketName',
            value: bucket.bucketName,
            exportName: `${exportPrefix}BucketName`
        });

        const publisherUser = props.createPublisherUser
            ? new User(this, 'PublisherUser', {
                  userName: `publisher-${siteName}`
              })
            : undefined;

        if (publisherUser) {
            new CfnOutput(this, 'PublisherUserName', {
                description: 'PublisherUser',
                value: publisherUser.userName,
                exportName: `${exportPrefix}PublisherUser`
            });
        }

        const publisherGroup = props.createPublisherGroup
            ? new Group(this, 'PublisherGroup')
            : undefined;

        if (publisherGroup) {
            bucket.grantReadWrite(publisherGroup);

            new CfnOutput(this, 'PublisherGroupName', {
                description: 'PublisherGroup',
                value: publisherGroup.groupName,
                exportName: `${exportPrefix}PublisherGroup`
            });

            if (publisherUser) {
                publisherGroup.addUser(publisherUser);
            }
        }

        const loggingBucket = props.enableCloudFrontAccessLogging
            ? new Bucket(this, 'LoggingBucket', {
                  bucketName: `${siteName}-access-logs`,
                  encryption: BucketEncryption.S3_MANAGED,
                  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                  removalPolicy: RemovalPolicy.RETAIN,
                  enforceSSL: enforceSSL
              })
            : undefined;

        if (loggingBucket) {
            new CfnOutput(this, 'LoggingBucketName', {
                description: 'CloudFront Logs',
                value: loggingBucket.bucketName,
                exportName: `${exportPrefix}LoggingBucketName`
            });
        }

        const loggingConfig = loggingBucket
            ? { bucket: loggingBucket }
            : undefined;

        const s3Origin = new S3Origin(bucket);

        const originRequestPolicy = new OriginRequestPolicy(
            this,
            's3OriginRequestPolicy',
            {
                headerBehavior:
                    OriginRequestHeaderBehavior.allowList('x-forwarded-host')
            }
        );

        const originCachePolicy = new CachePolicy(this, 's3OriginCachePolicy', {
            headerBehavior: CacheHeaderBehavior.allowList('x-forwarded-host'),
            enableAcceptEncodingBrotli: true,
            enableAcceptEncodingGzip: true
        });

        const errorResponses: ErrorResponse[] = [
            {
                httpStatus: 404,
                responseHttpStatus: 200,
                responsePagePath: props.errorResponsePagePath ?? '/index.html',
                ttl: Duration.seconds(0)
            }
        ];

        const distributionProps: DistributionProps = {
            domainNames: props.domainNames,
            webAclId: props.webAclId,
            defaultRootObject: props.defaultRootObject,
            httpVersion: HttpVersion.HTTP3,
            sslSupportMethod: SSLMethod.SNI,
            priceClass: PriceClass.PRICE_CLASS_ALL,
            enableLogging: props.enableCloudFrontAccessLogging,
            logBucket: loggingConfig?.bucket,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2018,
            certificate: Certificate.fromCertificateArn(
                this,
                'domain-certificate',
                props.certificateArn
            ),
            defaultBehavior: {
                origin: s3Origin,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                edgeLambdas: props.defaultBehaviourEdgeLambdas,
                originRequestPolicy: originRequestPolicy,
                cachePolicy: originCachePolicy
            },
            additionalBehaviors: props.additionalBehaviors,
            errorResponses: props.enableErrorConfig ? errorResponses : []
        };

        const distribution = new Distribution(
            this,
            'BucketCdn',
            distributionProps
        );

        if (props.overrideLogicalId) {
            const cfnDistribution = distribution.node
                .defaultChild as CfnDistribution;
            cfnDistribution.overrideLogicalId(props.overrideLogicalId);
        }

        // TODO: CSP
        // if (!disableCSP) {
        //     const cspHeader = this.generateCSPString(
        //         props.csp,
        //         props.explicitCSP
        //     );

        //     const headersPolicy = new ResponseHeadersPolicy(
        //         this,
        //         'ResponseHeaders',
        //         {
        //             securityHeadersBehavior: {
        //                 contentSecurityPolicy: {
        //                     contentSecurityPolicy: cspHeader,
        //                     override: true
        //                 }
        //             }
        //         }
        //     );

        //     const cfnDistribution = distribution.node
        //         .defaultChild as CfnDistribution;
        //     // In the current version of CDK there's no nice way to do this...
        //     // Instead just override the CloudFormation property directly
        //     cfnDistribution.addOverride(
        //         'Properties.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
        //         headersPolicy.responseHeadersPolicyId
        //     );

        //     new CfnOutput(this, 'CSP Header', {
        //         description: 'CSP Header',
        //         value: cspHeader,
        //         exportName: `${exportPrefix}CSPHeader`
        //     });
        // }

        /**
         * Response Header policies
         * This feature helps to attached custom ResponseHeadersPolicies to
         *  the cache behaviors
         */
        // if (props.responseHeadersPolicies) {
        //     const cfnDistribution = distribution.node
        //         .defaultChild as CfnDistribution;

        //     /**
        //      * If we prepend custom origin configs,
        //      *  it would change the array indexes.
        //      */
        //     let numberOfCustomBehaviors = 0;
        //     if (props.prependCustomOriginBehaviours) {
        //         numberOfCustomBehaviors = props.customOriginConfigs?.reduce(
        //             (acc, current) => acc + current.behaviors.length,
        //             0
        //         )!;
        //     }

        //     props.responseHeadersPolicies.forEach((policyMapping) => {
        //         /**
        //          * If the policy should be attached to default behavior
        //          */
        //         if (policyMapping.attachToDefault) {
        //             cfnDistribution.addOverride(
        //                 `Properties.DistributionConfig.` +
        //                     `DefaultCacheBehavior.` +
        //                     `ResponseHeadersPolicyId`,
        //                 policyMapping.header.responseHeadersPolicyId
        //             );
        //             new CfnOutput(
        //                 this,
        //                 `response header policies ${policyMapping.header.node.id} default`,
        //                 {
        //                     description: `response header policy mappings`,
        //                     value: `{ path: "default", policy: "${policyMapping.header.responseHeadersPolicyId}" }`,
        //                     exportName: `${exportPrefix}HeaderPolicy-default`
        //                 }
        //             );
        //         }
        //         /**
        //          * If the policy should be attached to
        //          *  specified path patterns
        //          */
        //         policyMapping.pathPatterns.forEach((path) => {
        //             /**
        //              * Looking for the index of the behavior
        //              *  according to the path pattern
        //              * If the path patter is not found, it would be ignored
        //              */
        //             let behaviorIndex =
        //                 props.behaviors?.findIndex((behavior) => {
        //                     return behavior.pathPattern === path;
        //                 })! + numberOfCustomBehaviors;

        //             if (behaviorIndex >= numberOfCustomBehaviors) {
        //                 cfnDistribution.addOverride(
        //                     `Properties.DistributionConfig.CacheBehaviors.` +
        //                         `${behaviorIndex}` +
        //                         `.ResponseHeadersPolicyId`,
        //                     policyMapping.header.responseHeadersPolicyId
        //                 );
        //                 new CfnOutput(
        //                     this,
        //                     `response header policies ${
        //                         policyMapping.header.node.id
        //                     } ${path.replace(/\W/g, '')}`,
        //                     {
        //                         description: `response header policy mappings`,
        //                         value: `{ path: "${path}", policy: "${policyMapping.header.responseHeadersPolicyId}"}`,
        //                         exportName: `${exportPrefix}HeaderPolicy-${path.replace(
        //                             /\W/g,
        //                             ''
        //                         )}`
        //                     }
        //                 );
        //             }
        //         });
        //     });
        // }

        if (publisherGroup) {
            const cloudFrontInvalidationPolicyStatement = new PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    'cloudfront:CreateInvalidation',
                    'cloudfront:GetInvalidation',
                    'cloudfront:ListInvalidations'
                ],
                resources: [
                    `arn:aws:cloudfront::*:distribution/${distribution.distributionId}`
                ]
            });

            const cloudFrontInvalidationPolicy = new Policy(
                this,
                'CloudFrontInvalidationPolicy',
                {
                    groups: [publisherGroup],
                    statements: [cloudFrontInvalidationPolicyStatement]
                }
            );
        }
        new CfnOutput(this, 'DistributionId', {
            description: 'DistributionId',
            value: distribution.distributionId,
            exportName: `${exportPrefix}DistributionID`
        });
        new CfnOutput(this, 'DistributionDomainName', {
            description: 'DistributionDomainName',
            value: distribution.distributionDomainName,
            exportName: `${exportPrefix}DistributionName`
        });

        if (props.createDnsRecord && props.zoneName) {
            const zone = HostedZone.fromLookup(this, 'Zone', {
                domainName: props.zoneName
            });

            new ARecord(this, 'SiteAliasRecord', {
                recordName: siteName,
                target: RecordTarget.fromAlias(
                    new CloudFrontTarget(distribution)
                ),
                zone: zone
            });
        }
    }

    private generateCSPString(csp?: CSP, explicit?: boolean) {
        // Ensure that default-src is always set
        if (!csp) return '';

        const cspEntries = explicit
            ? csp
            : {
                  'default-src': [],
                  ...csp
              };

        return Object.entries(cspEntries)
            .reduce((prevCspHeader, [cspType, cspHeaders]) => {
                if (explicit || cspType === 'report-uri')
                    return `${prevCspHeader} ${cspType} ${cspHeaders.join(
                        ' '
                    )};`;

                const typeOptions = ["'self'", "'unsafe-inline'"];
                if (['font-src', 'img-src'].includes(cspType))
                    typeOptions.push('data:');

                if (process.env.MAGENTO_BACKEND_URL)
                    typeOptions.push(process.env.MAGENTO_BACKEND_URL);

                const cspContent = `${cspHeaders.join(' ')} ${typeOptions.join(
                    ' '
                )}`.trim();

                return `${prevCspHeader} ${cspType} ${cspContent};`;
            }, '')
            .trim();
    }
}
