import { Construct } from 'constructs';
import { CfnOutput, RemovalPolicy, StackProps, Stack} from 'aws-cdk-lib';
import { Bucket, BucketEncryption, BlockPublicAccess, BucketProps } from 'aws-cdk-lib/aws-s3';
import { OriginAccessIdentity, CloudFrontWebDistribution, PriceClass, ViewerProtocolPolicy, SecurityPolicyProtocol, SSLMethod, Behavior, SourceConfiguration, CloudFrontWebDistributionProps } from 'aws-cdk-lib/aws-cloudfront';
import { HostedZone, RecordTarget, ARecord } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { User, Group, Policy, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export interface StaticHostingProps {
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
     * Optional set of behaviors to override the default behvior defined in this construct
     */
    behaviors?: Array<Behavior>;
    enableErrorConfig: boolean;
    defaultRootObject?: string;
    /** 
     * Extend the default props for S3 bucket
    */
    s3ExtendedProps?: BucketProps;
}

export class StaticHosting extends Construct {
    constructor(scope: Construct, id: string, props: StaticHostingProps) {
        super(scope, id);

        const siteName = `${props.subDomainName}.${props.domainName}`;
        const siteNameArray: Array<string> = [siteName];

        let distributionCnames: Array<string> = (props.extraDistributionCnames) ?
        siteNameArray.concat(props.extraDistributionCnames) :
        siteNameArray;


        const s3LoggingBucket = (props.enableS3AccessLogging)
            ? new Bucket(this, 'S3LoggingBucket', {
                bucketName: `${siteName}-s3-access-logs`,
                encryption: BucketEncryption.S3_MANAGED,
                blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                removalPolicy: RemovalPolicy.RETAIN,
                enforceSSL: true
            })
            : undefined;

        if (s3LoggingBucket) {
            new CfnOutput(this, 'S3LoggingBucketName', {
                description: "S3 Logs",
                value: s3LoggingBucket.bucketName,
            });
        }

        const bucket = new Bucket(this, 'ContentBucket', {
            bucketName: siteName,
            encryption: BucketEncryption.S3_MANAGED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            serverAccessLogsBucket: s3LoggingBucket,
            enforceSSL: true,
            ...props.s3ExtendedProps
        });

        new CfnOutput(this, 'Bucket', {
            description: 'BucketName',
            value: bucket.bucketName,
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
                enforceSSL: true
            })
            : undefined;

        if (loggingBucket) {
            loggingBucket.grantWrite(oai);

            new CfnOutput(this, 'LoggingBucketName', {
                description: "CloudFront Logs",
                value: loggingBucket.bucketName,
            });
        }

        const loggingConfig = (loggingBucket)
            ? { bucket: loggingBucket }
            : undefined

        // Create default origin
        let originConfigs = new Array<SourceConfiguration>();
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

        // Add any custom origins passed to the construct
        if (props.customOriginConfigs) {
            if (props.prependCustomOriginBehaviours) {
                originConfigs = props.customOriginConfigs.concat(originConfigs);
            } else {
                originConfigs = originConfigs.concat(props.customOriginConfigs);
            }
        }


        let distributionProps: CloudFrontWebDistributionProps = {
          viewerCertificate: {
            aliases: distributionCnames,
            props: {
                acmCertificateArn: props.certificateArn,
                minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2018,
                sslSupportMethod: SSLMethod.SNI,
            }
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
              errorConfigurations: [{
                errorCode: 404,
                errorCachingMinTtl: 0,
                responseCode: 200,
                responsePagePath: '/index.html',
              }]
            }
          }
        }

        const distribution = new CloudFrontWebDistribution(this, 'BucketCdn', distributionProps)

        if(publisherGroup) {
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
        });
        new CfnOutput(this, 'DistributionDomainName', {
            description: 'DistributionDomainName',
            value: distribution.distributionDomainName,
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
};
