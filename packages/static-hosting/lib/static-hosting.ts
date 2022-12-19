import { Construct, CfnOutput, RemovalPolicy } from '@aws-cdk/core';
import { Bucket, BucketEncryption, BlockPublicAccess, BucketProps } from '@aws-cdk/aws-s3';
import { OriginAccessIdentity, CloudFrontWebDistribution, PriceClass, ViewerProtocolPolicy, SecurityPolicyProtocol, SSLMethod, Behavior, SourceConfiguration, CloudFrontWebDistributionProps, LambdaEdgeEventType, CfnDistribution, ResponseHeadersPolicy, HttpVersion } from '@aws-cdk/aws-cloudfront';
import { HostedZone, ARecord } from '@aws-cdk/aws-route53';
import { User, Group, Policy, PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import { Version } from '@aws-cdk/aws-lambda';
import { ArbitraryPathRemapFunction } from './arbitrary-path-remap';
import { CSP } from '../types/csp';
import { RecordTarget } from '@aws-cdk/aws-route53';
import { CloudFrontTarget } from '@aws-cdk/aws-route53-targets';

export interface StaticHostingProps {
    exportPrefix?: string,
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
    /**
     * Used to add Custom origins and behaviors
     */
    customOriginConfigs?: Array<SourceConfiguration>;
    /**
     * Used to prepend the behaviours introduced as part of customOriginConfigs.
     * This is a work around until this construct is updated to use the new
     * Distribution API.
     * https://docs.aws.amazon.com/cdk/api/latest/docs/aws-cloudfront-readme.html#distribution-api
     */
    prependCustomOriginBehaviours?: boolean;

    /**
     * Optional set of behaviors to override the default behavior defined in this construct
     */
    behaviors?: Array<Behavior>;
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

    /**
     * Response Header policies
     */
    responseHeaders?: ResponseHeaderMappings[];
}

interface remapPath {
    from: string,
    to: string
}

export interface ResponseHeaderMappings {
    header: ResponseHeadersPolicy,
    pathPatterns: string[]
}

export class StaticHosting extends Construct {
    private staticFiles = ["js", "css", "json", "svg", "jpg", "jpeg", "png"];

    constructor(scope: Construct, id: string, props: StaticHostingProps) {
        super(scope, id);

        // Should the stackExportPrefix is empty, 'StaticHosting' should be used as the prefix 
        const exportPrefix = props.exportPrefix ? props.exportPrefix : 'StaticHosting'

        const siteName = `${props.subDomainName}.${props.domainName}`;
        const siteNameArray: Array<string> = [siteName];
        const enforceSSL = props.enforceSSL !== false;
        const enableStaticFileRemap = props.enableStaticFileRemap !== false;
        const disableCSP = props.disableCSP === true;

        let distributionCnames: Array<string> = (props.extraDistributionCnames) ?
            siteNameArray.concat(props.extraDistributionCnames) :
            siteNameArray;


        const s3LoggingBucket = (props.enableS3AccessLogging)
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
                description: "S3 Logs",
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

        const oai = new OriginAccessIdentity(this, 'OriginAccessIdentity', {
            comment: 'Allow CloudFront to access S3',
        });

        bucket.grantRead(oai);

        const publisherUser = (props.createPublisherUser)
            ? new User(this, 'PublisherUser', {
                userName: `publisher-${siteName}`,
            })
            : undefined;

        if (publisherUser) {
            new CfnOutput(this, 'PublisherUserName', {
                description: 'PublisherUser',
                value: publisherUser.userName,
                exportName: `${exportPrefix}PublisherUser`
            });
        };

        const publisherGroup = (props.createPublisherGroup)
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
            };
        };

        const loggingBucket = (props.enableCloudFrontAccessLogging)
            ? new Bucket(this, 'LoggingBucket', {
                bucketName: `${siteName}-access-logs`,
                encryption: BucketEncryption.S3_MANAGED,
                blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                removalPolicy: RemovalPolicy.RETAIN,
                enforceSSL: enforceSSL
            })
            : undefined;

        if (loggingBucket) {
            loggingBucket.grantWrite(oai);

            new CfnOutput(this, 'LoggingBucketName', {
                description: "CloudFront Logs",
                value: loggingBucket.bucketName,
                exportName: `${exportPrefix}LoggingBucketName`
            });
        }

        const loggingConfig = (loggingBucket)
            ? { bucket: loggingBucket }
            : undefined


        let originConfigs = new Array<SourceConfiguration>();

        // Add the backend host as an origin
        if (props.backendHost) {
            originConfigs.push({
                customOriginSource: {
                    domainName: props.backendHost
                },
                behaviors: [] // Behaviors will be added below
            });

            // Redirect paths
            if (props.remapBackendPaths) {
                for (const path of props.remapBackendPaths) {
                    originConfigs[0].behaviors.push(this.createRemapBehavior(path.from, path.to));
                }
            }
        }

        // Create default origin
        originConfigs.push({
            s3OriginSource: {
                s3BucketSource: bucket,
                originAccessIdentity: oai
            },
            // if behaviors have been passed via props use them instead
            behaviors: props.behaviors ? props.behaviors : [{
                isDefaultBehavior: true
            }]
        });

        // Create behaviors to map static content to bucket
        if (enableStaticFileRemap) {
            for (const path of this.staticFiles) {
                originConfigs[originConfigs.length - 1].behaviors.push(this.createRemapBehavior(`*.${path}`, `*.${path}`));
            }
        }

        // Redirect paths
        if (props.remapPaths) {
            for (const path of props.remapPaths) {
                originConfigs[originConfigs.length - 1].behaviors.push(this.createRemapBehavior(path.from, path.to));
            }
        }

        // Add any custom origins passed to the construct
        if (props.customOriginConfigs) {
            if (props.prependCustomOriginBehaviours) {
                originConfigs = props.customOriginConfigs.concat(originConfigs);
            } else {
                originConfigs = originConfigs.concat(props.customOriginConfigs);
            }
        }

        let distributionProps: CloudFrontWebDistributionProps = {
            ...(props.webAclArn && {webACLId: props.webAclArn}), // Add the WAF if it has been added via props, must be added like this as distributionProps.webACLId is a readonly property
            aliasConfiguration: {
                acmCertRef: props.certificateArn,
                names: distributionCnames,
                securityPolicy: SecurityPolicyProtocol.TLS_V1_2_2018,
                sslMethod: SSLMethod.SNI,
            },
            originConfigs,
            defaultRootObject: props.defaultRootObject,
            priceClass: PriceClass.PRICE_CLASS_ALL,
            viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            loggingConfig: loggingConfig,
        };

        if (props.enableErrorConfig) {
            distributionProps = {
                ...distributionProps, ...{
                    httpVersion: 'http3' as HttpVersion.HTTP2,
                    errorConfigurations: [{
                        errorCode: 404,
                        errorCachingMinTtl: 0,
                        responseCode: 200,
                        responsePagePath: '/index.html',
                    }]
                }
            }
        }

        const distribution = new CloudFrontWebDistribution(this, 'BucketCdn', distributionProps);

        if (!disableCSP) {
            const cspHeader = this.generateCSPString(props.csp, props.explicitCSP);

            const headersPolicy = new ResponseHeadersPolicy(this, 'ResponseHeaders', {
                securityHeadersBehavior: {
                    contentSecurityPolicy: {
                        contentSecurityPolicy: cspHeader,
                        override: true,
                    },
                }
            });

            const cfnDistribution = distribution.node.defaultChild as CfnDistribution;
            // In the current version of CDK there's no nice way to do this...
            // Instead just override the CloudFormation property directly
            cfnDistribution.addOverride(
                'Properties.DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId',
                headersPolicy.responseHeadersPolicyId
            );

            new CfnOutput(this, 'CSP Header', {
                description: 'CSP Header',
                value: cspHeader,
                exportName: `${exportPrefix}CSPHeader`
            });
        }

        /**
         * Response Header policies
         */
        if (props.responseHeaders) {
            const cfnDistribution = distribution.node.defaultChild as CfnDistribution;

            /**
             * If we prepend custom origin configs,
             *  it would change the array indexes.
             */
            let numberOfCustomBehaviors = 0;
            if (props.prependCustomOriginBehaviours) {
                numberOfCustomBehaviors = props.customOriginConfigs?.reduce((acc, current) => acc + current.behaviors.length, 0)!;
            }
            props.responseHeaders.forEach( (policyMapping) => {
                policyMapping.pathPatterns.forEach(path => cfnDistribution.addOverride(
                    `Properties.DistributionConfig.CacheBehaviors.` +
                    `${props.behaviors?.findIndex(behavior => {return behavior.pathPattern === path})! + numberOfCustomBehaviors}` +
                    `.ResponseHeadersPolicyId`,
                    policyMapping.header.responseHeadersPolicyId
                ));
            });
        }

        if (publisherGroup) {
            const cloudFrontInvalidationPolicyStatement = new PolicyStatement({
                effect: Effect.ALLOW,
                actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation', 'cloudfront:ListInvalidations'],
                resources: [`arn:aws:cloudfront::*:distribution/${distribution.distributionId}`],
            });

            const cloudFrontInvalidationPolicy = new Policy(this, 'CloudFrontInvalidationPolicy', {
                groups: [publisherGroup],
                statements: [cloudFrontInvalidationPolicyStatement],
            });
        };
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
            const zone = HostedZone.fromLookup(this, 'Zone', { domainName: props.zoneName });

            new ARecord(this, 'SiteAliasRecord', {
                recordName: siteName,
                target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
                zone: zone,
            });
        };
    };

    private createRemapBehavior(from: string, to: string): Behavior {
        const behavior = {
            pathPattern: from,
            lambdaFunctionAssociations: []
        } as Behavior;

        // If the remap is to a different path, create a Lambda@Edge function to handle this
        if (from !== to) {
            // Remove special characters from path
            const id = from.replace(/[&\/\\#,+()$~%'":*?<>{}]/g, '-');

            const remapFunction = new ArbitraryPathRemapFunction(this, `remap-function-${id}`, { path: to });
            behavior.lambdaFunctionAssociations?.push({
                eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
                lambdaFunction: Version.fromVersionArn(this, `remap-function-association-${id}`,
                    remapFunction.edgeFunction.currentVersion.functionArn)
            });
        }

        return behavior;
    }

    private generateCSPString(csp?: CSP, explicit?: boolean) {
        // Ensure that default-src is always set
        if (!csp) 
            return "";

        const cspEntries = explicit ? csp: {
            'default-src': [],
            ...csp
        };

        return Object.entries(cspEntries)
            .reduce((prevCspHeader, [cspType, cspHeaders]) => {
                if (explicit || cspType === 'report-uri')
                    return `${prevCspHeader} ${cspType} ${cspHeaders.join(' ')};`;

                const typeOptions = ["'self'", "'unsafe-inline'"];
                if (['font-src', 'img-src'].includes(cspType)) 
                    typeOptions.push("data:");

                if (process.env.MAGENTO_BACKEND_URL) 
                    typeOptions.push(process.env.MAGENTO_BACKEND_URL);

                const cspContent = `${cspHeaders.join(' ')} ${typeOptions.join(
                    ' '
                )}`.trim();

                return `${prevCspHeader} ${cspType} ${cspContent};`;
            }, '')
            .trim();
    }
};
