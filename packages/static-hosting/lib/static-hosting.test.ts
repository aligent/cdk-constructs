import { App, Stack, Duration } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { StaticHosting, StaticHostingProps } from "./static-hosting";

describe("StaticHosting", () => {
  // Helper function to create isolated test environment
  const createTestStack = () => {
    const app = new App();
    const stack = new Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    return { app, stack };
  };

  const defaultProps: StaticHostingProps = {
    domainName: "example.com",
    subDomainName: "www",
    certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/test-cert",
  };

  describe("Basic Setup", () => {
    it("should create basic resources with minimal props", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", defaultProps);

      const template = Template.fromStack(stack);

      // S3 Bucket
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "www.example.com",
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });

      // CloudFront Distribution
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Aliases: ["www.example.com"],
          DefaultRootObject: "index.html",
          HttpVersion: "http2and3",
          IPV6Enabled: true,
          ViewerCertificate: {
            AcmCertificateArn:
              "arn:aws:acm:us-east-1:123456789012:certificate/test-cert",
            MinimumProtocolVersion: "TLSv1.2_2021",
            SslSupportMethod: "sni-only",
          },
        },
      });

      // Origin Access Identity
      template.hasResourceProperties(
        "AWS::CloudFront::CloudFrontOriginAccessIdentity",
        {
          CloudFrontOriginAccessIdentityConfig: {
            Comment: "Allow CloudFront to access S3",
          },
        }
      );

      // Outputs - verify they exist by checking the exports
      const outputs = template.toJSON().Outputs;
      const outputNames = Object.keys(outputs || {});

      // Check that outputs exist by looking for ones containing our expected keys
      expect(outputNames.some(name => name.includes("Bucket"))).toBe(true);
      expect(outputNames.some(name => name.includes("DistributionId"))).toBe(
        true
      );
      expect(
        outputNames.some(name => name.includes("DistributionDomainName"))
      ).toBe(true);
      expect(outputNames.some(name => name.includes("PublisherUserName"))).toBe(
        true
      );
      expect(
        outputNames.some(name => name.includes("PublisherGroupName"))
      ).toBe(true);
    });

    it("should handle extra distribution CNAMEs", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        extraDistributionCnames: ["alias1.example.com", "alias2.example.com"],
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Aliases: [
            "www.example.com",
            "alias1.example.com",
            "alias2.example.com",
          ],
        },
      });
    });

    it("should use custom export prefix", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        exportPrefix: "MyCustomPrefix",
      });

      const template = Template.fromStack(stack);
      const outputs = template.toJSON().Outputs;
      const outputNames = Object.keys(outputs || {});
      expect(outputNames.some(name => name.includes("Bucket"))).toBe(true);
    });
  });

  describe("S3 Bucket Configuration", () => {
    it("should disable SSL enforcement when enforceSSL is false", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        enforceSSL: false,
      });

      const template = Template.fromStack(stack);
      template.hasResource("AWS::S3::BucketPolicy", {
        Properties: {
          PolicyDocument: {
            Statement: Match.not(
              Match.arrayWith([
                Match.objectLike({
                  Condition: { Bool: { "aws:SecureTransport": "false" } },
                }),
              ])
            ),
          },
        },
      });
    });

    it("should enable S3 access logging", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        enableS3AccessLogging: true,
      });

      const template = Template.fromStack(stack);

      // Logging bucket
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "www.example.com-s3-access-logs",
      });

      // Main bucket with logging enabled
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "www.example.com",
        LoggingConfiguration: {
          DestinationBucketName: { Ref: Match.anyValue() },
        },
      });
    });

    it("should extend S3 bucket props", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        s3ExtendedProps: {
          versioned: true,
          lifecycleRules: [
            {
              id: "test-rule",
              enabled: true,
              noncurrentVersionExpiration: Duration.days(30),
            },
          ],
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "www.example.com",
        VersioningConfiguration: { Status: "Enabled" },
      });

      // Verify lifecycle rule exists
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: "test-rule",
              Status: "Enabled",
            }),
          ]),
        },
      });
    });
  });

  describe("CloudFront Configuration", () => {
    it("should enable CloudFront access logging", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        enableCloudFrontAccessLogging: true,
      });

      const template = Template.fromStack(stack);

      // Logging bucket
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: "www.example.com-access-logs",
      });

      // Distribution with logging enabled
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Logging: Match.objectLike({
            Bucket: Match.anyValue(),
          }),
        },
      });
    });

    it("should configure error pages", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        enableErrorConfig: true,
        errorResponsePagePath: "/custom-error.html",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          CustomErrorResponses: [
            {
              ErrorCode: 404,
              ResponseCode: 200,
              ResponsePagePath: "/custom-error.html",
              ErrorCachingMinTTL: 0,
            },
          ],
        },
      });
    });

    it("should set custom default root object", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        defaultRootObject: "custom-index.html",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          DefaultRootObject: "custom-index.html",
        },
      });
    });

    it("should add WAF ACL", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        webAclArn:
          "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test/123",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          WebACLId:
            "arn:aws:wafv2:us-east-1:123456789012:global/webacl/test/123",
        },
      });
    });

    it("should add comment to distribution", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        comment: "My test distribution",
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::Distribution", {
        DistributionConfig: {
          Comment: "My test distribution",
        },
      });
    });

    it("should override logical ID", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        overrideLogicalId: "MyCustomDistributionId",
      });

      const template = Template.fromStack(stack);
      const resources = template.toJSON().Resources;
      expect(resources).toHaveProperty("MyCustomDistributionId");
      expect(resources.MyCustomDistributionId.Type).toBe(
        "AWS::CloudFront::Distribution"
      );
    });
  });

  describe("Static File Behaviors", () => {
    it("should create static file behaviors by default", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", defaultProps);

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      const staticExtensions = [
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
      staticExtensions.forEach(ext => {
        expect(distConfig.CacheBehaviors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ PathPattern: `*.${ext}` }),
          ])
        );
      });
    });

    it("should disable static file behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        enableStaticFileRemap: false,
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      expect(distConfig.CacheBehaviors).toBeUndefined();
    });

    it("should apply static file behaviors with prefixes", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        defaultBehaviourPrefixes: [
          { prefix: "/assets", behaviourOverride: {} },
          { prefix: "/static", behaviourOverride: {} },
        ],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      expect(distConfig.CacheBehaviors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ PathPattern: "/assets/*.js" }),
          expect.objectContaining({ PathPattern: "/static/*.js" }),
        ])
      );
    });
  });

  describe("Path Remapping", () => {
    it("should create remap behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        remapPaths: [
          { from: "/robots.txt", to: "/deployed_robots.txt" },
          { from: "/sitemap.xml" },
        ],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      expect(distConfig.CacheBehaviors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ PathPattern: "/robots.txt" }),
          expect.objectContaining({ PathPattern: "/sitemap.xml" }),
        ])
      );

      // Lambda function should be created for path remapping
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "remap.handler",
        Runtime: "nodejs22.x",
      });
    });

    it("should create backend remap behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        backendHost: "backend.example.com",
        remapBackendPaths: [{ from: "/api/*", to: "/v1/api/*" }],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      expect(distConfig.CacheBehaviors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ PathPattern: "/api/*" }),
        ])
      );

      // Should have backend origin
      expect(distConfig.Origins).toHaveLength(2);
      expect(distConfig.Origins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            CustomOriginConfig: expect.objectContaining({
              OriginProtocolPolicy: "https-only",
            }),
            DomainName: "backend.example.com",
          }),
        ])
      );
    });
  });

  describe("CSP Configuration", () => {
    it("should disable CSP", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        disableCSP: true,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::CloudFront::ResponseHeadersPolicy", 0);
    });

    it("should create CSP header with default settings", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        csp: {
          "default-src": ["https://example.com"],
          "script-src": ["https://scripts.example.com"],
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            ContentSecurityPolicy: {
              ContentSecurityPolicy: Match.stringLikeRegexp(
                "default-src.*script-src"
              ),
              Override: true,
            },
          },
        },
      });
    });

    it("should create explicit CSP", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        explicitCSP: true,
        csp: {
          "default-src": ["'self'"],
          "script-src": ["'self'", "'unsafe-inline'"],
        },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig: {
            ContentSecurityPolicy: {
              ContentSecurityPolicy:
                "default-src 'self'; script-src 'self' 'unsafe-inline';",
              Override: true,
            },
          },
        },
      });
    });
  });

  describe("CORS Configuration", () => {
    it("should not create CORS policy when corsAllowOrigins is not provided", () => {
      const { stack } = createTestStack();
      const hosting = new StaticHosting(stack, "TestConstruct", defaultProps);

      expect(hosting.corsResponseHeadersPolicy).toBeUndefined();
    });

    it("should create CORS policy when corsAllowOrigins is provided", () => {
      const { stack } = createTestStack();
      const hosting = new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com", "https://app.example.com"],
      });

      expect(hosting.corsResponseHeadersPolicy).toBeDefined();

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: {
          CorsConfig: {
            AccessControlAllowCredentials: false,
            AccessControlAllowHeaders: {
              Items: ["*"],
            },
            AccessControlAllowMethods: {
              Items: ["GET", "HEAD", "OPTIONS"],
            },
            AccessControlAllowOrigins: {
              Items: ["https://example.com", "https://app.example.com"],
            },
            OriginOverride: true,
          },
        },
      });
    });

    it("should apply CORS policy to static file behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com"],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      // Check that static file behaviors have a response headers policy
      const jsBehavior = distConfig.CacheBehaviors.find(
        (b: { PathPattern: string }) => b.PathPattern === "*.js"
      );
      expect(jsBehavior).toBeDefined();
      expect(jsBehavior.ResponseHeadersPolicyId).toBeDefined();

      const cssBehavior = distConfig.CacheBehaviors.find(
        (b: { PathPattern: string }) => b.PathPattern === "*.css"
      );
      expect(cssBehavior).toBeDefined();
      expect(cssBehavior.ResponseHeadersPolicyId).toBeDefined();
    });

    it("should not apply CORS policy to static files when corsAllowOrigins is empty array", () => {
      const { stack } = createTestStack();
      const hosting = new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: [],
      });

      expect(hosting.corsResponseHeadersPolicy).toBeUndefined();

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      // Check that static file behaviors do not have a response headers policy
      const jsBehavior = distConfig.CacheBehaviors.find(
        (b: { PathPattern: string }) => b.PathPattern === "*.js"
      );
      expect(jsBehavior).toBeDefined();
      expect(jsBehavior.ResponseHeadersPolicyId).toBeUndefined();
    });

    it("should expose corsResponseHeadersPolicy for downstream use", () => {
      const { stack } = createTestStack();
      const hosting = new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com"],
      });

      // The policy should be accessible for downstream projects to use
      // in their own custom behaviors
      expect(hosting.corsResponseHeadersPolicy).toBeDefined();
      expect(typeof hosting.corsResponseHeadersPolicy).toBe("object");
    });

    it("should apply CORS policy to remapPaths behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com"],
        remapPaths: [{ from: "/test-path", to: "/remapped-path" }],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      const remapBehavior = distConfig.CacheBehaviors.find(
        (b: { PathPattern: string }) => b.PathPattern === "/test-path"
      );
      expect(remapBehavior).toBeDefined();
      expect(remapBehavior.ResponseHeadersPolicyId).toBeDefined();
    });

    it("should apply CORS policy to remapBackendPaths behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com"],
        backendHost: "backend.example.com",
        remapBackendPaths: [{ from: "/api/*", to: "/api/*" }],
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      const backendBehavior = distConfig.CacheBehaviors.find(
        (b: { PathPattern: string }) => b.PathPattern === "/api/*"
      );
      expect(backendBehavior).toBeDefined();
      expect(backendBehavior.ResponseHeadersPolicyId).toBeDefined();
    });

    it("should apply CORS to default behavior when indexable is true", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        corsAllowOrigins: ["https://example.com"],
        indexable: true,
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      // Default behavior should have response headers policy (CORS)
      expect(
        distConfig.DefaultCacheBehavior.ResponseHeadersPolicyId
      ).toBeDefined();
    });
  });

  describe("Indexable Configuration", () => {
    it("should not create NoIndexNoFollow policy when indexable is true (default)", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", defaultProps);

      const template = Template.fromStack(stack);
      const policies = template.findResources(
        "AWS::CloudFront::ResponseHeadersPolicy"
      );

      // Should not have a NoIndexNoFollow policy
      const hasNoIndexPolicy = Object.values(policies).some(
        (policy: Record<string, unknown>) => {
          const config = (
            policy.Properties as {
              ResponseHeadersPolicyConfig?: {
                CustomHeadersConfig?: {
                  Items?: Array<{ Header: string; Value: string }>;
                };
              };
            }
          )?.ResponseHeadersPolicyConfig?.CustomHeadersConfig?.Items;
          return config?.some(
            item =>
              item.Header === "x-robots-tag" &&
              item.Value === "noindex,nofollow"
          );
        }
      );
      expect(hasNoIndexPolicy).toBe(false);
    });

    it("should create NoIndexNoFollow policy when indexable is false", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        indexable: false,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: {
          CustomHeadersConfig: {
            Items: [
              {
                Header: "x-robots-tag",
                Value: "noindex,nofollow",
                Override: true,
              },
            ],
          },
        },
      });
    });

    it("should combine NoIndexNoFollow with CORS when both indexable is false and corsAllowOrigins is set", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        indexable: false,
        corsAllowOrigins: ["https://example.com"],
      });

      const template = Template.fromStack(stack);
      // Should have a policy with both noindex and CORS
      template.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
        ResponseHeadersPolicyConfig: {
          CustomHeadersConfig: {
            Items: [
              {
                Header: "x-robots-tag",
                Value: "noindex,nofollow",
                Override: true,
              },
            ],
          },
          CorsConfig: {
            AccessControlAllowCredentials: false,
            AccessControlAllowHeaders: {
              Items: ["*"],
            },
            AccessControlAllowMethods: {
              Items: ["GET", "HEAD", "OPTIONS"],
            },
            AccessControlAllowOrigins: {
              Items: ["https://example.com"],
            },
            OriginOverride: true,
          },
        },
      });
    });

    it("should apply NoIndexNoFollow policy to default behavior", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        indexable: false,
      });

      const template = Template.fromStack(stack);
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      // Default behavior should have response headers policy
      expect(
        distConfig.DefaultCacheBehavior.ResponseHeadersPolicyId
      ).toBeDefined();
    });
  });

  // NOTE: This test creates EdgeFunctions which can cause cross-app reference issues
  // in subsequent tests. Keep this test section last.
  describe("CSP Path Behaviors", () => {
    it("should create CSP path behaviors", () => {
      const { stack } = createTestStack();
      new StaticHosting(stack, "TestConstruct", {
        ...defaultProps,
        cspPaths: [
          {
            path: "/admin/*",
            reportUri: "https://csp-report.example.com",
            fallbackCsp: "default-src 'self'",
          },
        ],
      });

      const template = Template.fromStack(stack);

      // Should create Lambda functions for CSP handling
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-request.handler",
        Runtime: "nodejs22.x",
      });

      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "origin-response.handler",
        Runtime: "nodejs22.x",
      });

      // Should create behavior for CSP path
      const distribution = template.findResources(
        "AWS::CloudFront::Distribution"
      );
      const distConfig =
        Object.values(distribution)[0].Properties.DistributionConfig;

      expect(distConfig.CacheBehaviors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ PathPattern: "/admin/*" }),
        ])
      );
    });
  });
});
