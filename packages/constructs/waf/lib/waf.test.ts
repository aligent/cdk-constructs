import { App, Stack, RemovalPolicy } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  WebApplicationFirewall,
  WebApplicationFirewallProps,
  REGIONAL,
  CLOUDFRONT,
} from "./waf";

describe("WebApplicationFirewall", () => {
  const createTestStack = () => {
    const app = new App();
    const stack = new Stack(app, "TestStack", {
      env: { account: "123456789012", region: "us-east-1" },
    });
    return { app, stack };
  };

  const defaultProps: WebApplicationFirewallProps = {
    wafName: "test-waf",
  };

  describe("Basic Setup", () => {
    it("should create WebACL with minimal props", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Name: "test-waf",
        Scope: "REGIONAL",
        DefaultAction: { Allow: {} },
      });
    });

    it("should expose webAclArn property", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      expect(waf.webAclArn).toBeDefined();
      expect(waf.web_acl).toBeDefined();
    });

    it("should use CLOUDFRONT scope when specified", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        scope: CLOUDFRONT,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Scope: "CLOUDFRONT",
      });
    });

    it("should use REGIONAL scope when specified", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        scope: REGIONAL,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Scope: "REGIONAL",
      });
    });

    it("should set blockByDefault when specified", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        blockByDefault: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        DefaultAction: { Block: {} },
      });
    });
  });

  describe("Activation Mode", () => {
    it("should use count mode by default (not activated)", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        rateLimit: 1000,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "rate_limit_rule",
            Action: { Count: {} },
          }),
        ]),
      });
    });

    it("should use block mode when activated", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        activate: true,
        rateLimit: 1000,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "rate_limit_rule",
            Action: { Block: {} },
          }),
        ]),
      });
    });

    it("should use none override for managed rules when activated", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        activate: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "common_rule_set",
            OverrideAction: { None: {} },
          }),
        ]),
      });
    });
  });

  describe("IP Blocklists", () => {
    it("should create IPv4 blocklist IP Set and rules", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        blockedIPs: ["1.2.3.4/32", "5.6.7.8/24"],
      });

      const template = Template.fromStack(stack);

      // Check IP Set is created
      template.hasResourceProperties("AWS::WAFv2::IPSet", {
        Addresses: ["1.2.3.4/32", "5.6.7.8/24"],
        IPAddressVersion: "IPV4",
        Description: "test-waf - Blocked IPv4 addresses",
      });

      // Check blocklist rules are created with correct priorities
      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "block_xff_ip_rule_v4",
            Priority: 1,
            Action: { Block: {} },
          }),
          Match.objectLike({
            Name: "block_src_ip_rule_v4",
            Priority: 2,
            Action: { Block: {} },
          }),
        ]),
      });

      // Check ARN is exposed
      expect(waf.ipv4BlocklistArn).toBeDefined();
    });

    it("should create IPv6 blocklist IP Set and rules", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        blockedIPv6s: ["2001:db8::/32"],
      });

      const template = Template.fromStack(stack);

      // Check IP Set is created
      template.hasResourceProperties("AWS::WAFv2::IPSet", {
        Addresses: ["2001:db8::/32"],
        IPAddressVersion: "IPV6",
        Description: "test-waf - Blocked IPv6 addresses",
      });

      // Check blocklist rules are created with correct priorities
      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "block_xff_ip_rule_v6",
            Priority: 3,
            Action: { Block: {} },
          }),
          Match.objectLike({
            Name: "block_src_ip_rule_v6",
            Priority: 4,
            Action: { Block: {} },
          }),
        ]),
      });

      // Check ARN is exposed
      expect(waf.ipv6BlocklistArn).toBeDefined();
    });

    it("should not create blocklist rules when arrays are empty", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        blockedIPs: [],
        blockedIPv6s: [],
      });

      const template = Template.fromStack(stack);

      // Check that no block rules are created
      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
      }>;
      const blockRuleNames = rules
        .filter(r => r.Name.startsWith("block_"))
        .map(r => r.Name);
      expect(blockRuleNames).toHaveLength(0);

      expect(waf.ipv4BlocklistArn).toBeUndefined();
      expect(waf.ipv6BlocklistArn).toBeUndefined();
    });
  });

  describe("IP Allowlists", () => {
    it("should create IPv4 allowlist IP Set and rules", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        allowedIPs: ["10.0.0.0/8", "192.168.1.0/24"],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::IPSet", {
        Addresses: ["10.0.0.0/8", "192.168.1.0/24"],
        IPAddressVersion: "IPV4",
      });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "allow_xff_ip_rule",
            Priority: 11,
            Action: { Allow: {} },
          }),
          Match.objectLike({
            Name: "allow_src_ip_rule",
            Priority: 12,
            Action: { Allow: {} },
          }),
        ]),
      });

      expect(waf.ipv4AllowlistArn).toBeDefined();
    });

    it("should create IPv6 allowlist IP Set and rules", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        allowedIPv6s: ["2001:db8:1234::/48"],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::IPSet", {
        Addresses: ["2001:db8:1234::/48"],
        IPAddressVersion: "IPV6",
      });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "allow_xff_ip_rule_ipv6",
            Priority: 13,
            Action: { Allow: {} },
          }),
          Match.objectLike({
            Name: "allow_src_ip_rule_ipv6",
            Priority: 14,
            Action: { Allow: {} },
          }),
        ]),
      });

      expect(waf.ipv6AllowlistArn).toBeDefined();
    });

    it("should not expose allowlist ARNs when not configured", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      expect(waf.ipv4AllowlistArn).toBeUndefined();
      expect(waf.ipv6AllowlistArn).toBeUndefined();
    });
  });

  describe("PHP Rules", () => {
    it("should enable PHP rules by default", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "php_rule_set",
            Priority: 22,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesPHPRuleSet",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should disable PHP rules when enablePhpRules is false", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enablePhpRules: false,
      });

      const template = Template.fromStack(stack);

      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
      }>;
      const phpRule = rules.find(r => r.Name === "php_rule_set");
      expect(phpRule).toBeUndefined();
    });

    it("should enable PHP rules when enablePhpRules is true", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enablePhpRules: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "php_rule_set",
          }),
        ]),
      });
    });
  });

  describe("Optional AWS Managed Rules", () => {
    it("should add IP Reputation List when enabled", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enableIpReputationList: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "ip_reputation_list",
            Priority: 23,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesAmazonIpReputationList",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should add Anonymous IP List when enabled", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enableAnonymousIpList: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "anonymous_ip_list",
            Priority: 24,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesAnonymousIpList",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should add SQL Injection rules when enabled", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enableSqlInjection: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "sql_injection_rule_set",
            Priority: 25,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesSQLiRuleSet",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should add Bot Control rules when enabled", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enableBotControl: true,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "bot_control_rule_set",
            Priority: 26,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesBotControlRuleSet",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should not add optional rules by default", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
      }>;
      const ruleNames = rules.map(r => r.Name);

      expect(ruleNames).not.toContain("ip_reputation_list");
      expect(ruleNames).not.toContain("anonymous_ip_list");
      expect(ruleNames).not.toContain("sql_injection_rule_set");
      expect(ruleNames).not.toContain("bot_control_rule_set");
    });
  });

  describe("Rate Limiting", () => {
    it("should create rate limit rule with FORWARDED_IP by default", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        rateLimit: 1000,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "rate_limit_rule",
            Priority: 30,
            Statement: {
              RateBasedStatement: {
                AggregateKeyType: "FORWARDED_IP",
                ForwardedIPConfig: {
                  FallbackBehavior: "MATCH",
                  HeaderName: "X-Forwarded-For",
                },
                Limit: 1000,
              },
            },
          }),
        ]),
      });
    });

    it("should use IP aggregation when rateLimitAggregation is IP", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        rateLimit: 500,
        rateLimitAggregation: "IP",
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "rate_limit_rule",
            Statement: {
              RateBasedStatement: {
                AggregateKeyType: "IP",
                Limit: 500,
              },
            },
          }),
        ]),
      });

      // Verify ForwardedIPConfig is NOT present
      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
        Statement: { RateBasedStatement?: { ForwardedIPConfig?: unknown } };
      }>;
      const rateLimitRule = rules.find(r => r.Name === "rate_limit_rule");
      expect(
        rateLimitRule?.Statement?.RateBasedStatement?.ForwardedIPConfig
      ).toBeUndefined();
    });

    it("should not create rate limit rule when rateLimit is not set", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
      }>;
      const rateLimitRule = rules.find(r => r.Name === "rate_limit_rule");
      expect(rateLimitRule).toBeUndefined();
    });
  });

  describe("Default AWS Managed Rules", () => {
    it("should always include bad_actors_rule", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "bad_actors_rule",
            Priority: 20,
            OverrideAction: { None: {} },
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesKnownBadInputsRuleSet",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should always include common_rule_set", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "common_rule_set",
            Priority: 21,
            Statement: {
              ManagedRuleGroupStatement: {
                Name: "AWSManagedRulesCommonRuleSet",
                VendorName: "AWS",
              },
            },
          }),
        ]),
      });
    });

    it("should exclude specified AWS rules", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        excludedAwsRules: ["SizeRestrictions_BODY", "CrossSiteScripting_BODY"],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "common_rule_set",
            Statement: {
              ManagedRuleGroupStatement: {
                ExcludedRules: [
                  { Name: "SizeRestrictions_BODY" },
                  { Name: "CrossSiteScripting_BODY" },
                ],
              },
            },
          }),
        ]),
      });
    });
  });

  describe("Logging Configuration", () => {
    it("should enable logging by default", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", defaultProps);

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "aws-waf-logs-test-waf",
        RetentionInDays: 365,
      });

      template.hasResourceProperties("AWS::WAFv2::LoggingConfiguration", {
        LogDestinationConfigs: Match.anyValue(),
      });
    });

    it("should disable logging when enableLogging is false", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        enableLogging: false,
      });

      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::Logs::LogGroup", 0);
      template.resourceCountIs("AWS::WAFv2::LoggingConfiguration", 0);
    });

    it("should respect custom log retention days", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        logRetentionDays: RetentionDays.ONE_WEEK,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::Logs::LogGroup", {
        RetentionInDays: 7,
      });
    });

    it("should respect custom log removal policy", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        logRemovalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      template.hasResource("AWS::Logs::LogGroup", {
        DeletionPolicy: "Delete",
      });
    });
  });

  describe("Associations", () => {
    it("should create WebACL associations", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        associations: [
          "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123",
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACLAssociation", {
        ResourceArn:
          "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/abc123",
      });
    });

    it("should create multiple WebACL associations", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        associations: [
          "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-1/abc123",
          "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-2/def456",
        ],
      });

      const template = Template.fromStack(stack);

      template.resourceCountIs("AWS::WAFv2::WebACLAssociation", 2);
    });
  });

  describe("Custom Rules", () => {
    it("should add preProcessCustomRules", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        preProcessCustomRules: [
          {
            name: "custom_pre_rule",
            priority: 5,
            statement: {
              byteMatchStatement: {
                fieldToMatch: { uriPath: {} },
                positionalConstraint: "STARTS_WITH",
                searchString: "/health",
                textTransformations: [{ priority: 0, type: "NONE" }],
              },
            },
            action: { allow: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "custom_pre_rule",
              sampledRequestsEnabled: true,
            },
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "custom_pre_rule",
            Priority: 5,
          }),
        ]),
      });
    });

    it("should add postProcessCustomRules", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        postProcessCustomRules: [
          {
            name: "custom_post_rule",
            priority: 35,
            statement: {
              byteMatchStatement: {
                fieldToMatch: { uriPath: {} },
                positionalConstraint: "CONTAINS",
                searchString: "admin",
                textTransformations: [{ priority: 0, type: "LOWERCASE" }],
              },
            },
            action: { block: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "custom_post_rule",
              sampledRequestsEnabled: true,
            },
          },
        ],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "custom_post_rule",
            Priority: 35,
          }),
        ]),
      });
    });
  });

  describe("Path Allowlist", () => {
    it("should create path allowlist rule", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        allowedPaths: ["^/api/.*", "^/health$"],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::RegexPatternSet", {
        RegularExpressionList: ["^/api/.*", "^/health$"],
      });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "allow_path_rule",
            Priority: 10,
            Action: { Allow: {} },
          }),
        ]),
      });
    });
  });

  describe("User Agent Allowlist", () => {
    it("should create user agent allowlist rule", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        allowedUserAgents: ["^Mozilla.*", "^curl.*"],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::WAFv2::RegexPatternSet", {
        RegularExpressionList: ["^Mozilla.*", "^curl.*"],
      });

      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: "allow_user_agent_rule",
            Priority: 15,
            Action: { Allow: {} },
          }),
        ]),
      });
    });
  });

  describe("Rule Priority Ordering", () => {
    it("should have rules in correct priority order", () => {
      const { stack } = createTestStack();
      new WebApplicationFirewall(stack, "TestWAF", {
        ...defaultProps,
        blockedIPs: ["1.2.3.4/32"],
        blockedIPv6s: ["2001:db8::/32"],
        allowedIPs: ["10.0.0.0/8"],
        allowedIPv6s: ["2001:db8:1234::/48"],
        allowedPaths: ["^/health$"],
        allowedUserAgents: ["^curl.*"],
        enablePhpRules: true,
        enableIpReputationList: true,
        enableAnonymousIpList: true,
        enableSqlInjection: true,
        enableBotControl: true,
        rateLimit: 1000,
        preProcessCustomRules: [
          {
            name: "pre_rule",
            priority: 5,
            statement: {
              byteMatchStatement: {
                fieldToMatch: { uriPath: {} },
                positionalConstraint: "STARTS_WITH",
                searchString: "/pre",
                textTransformations: [{ priority: 0, type: "NONE" }],
              },
            },
            action: { allow: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "pre_rule",
              sampledRequestsEnabled: true,
            },
          },
        ],
        postProcessCustomRules: [
          {
            name: "post_rule",
            priority: 35,
            statement: {
              byteMatchStatement: {
                fieldToMatch: { uriPath: {} },
                positionalConstraint: "STARTS_WITH",
                searchString: "/post",
                textTransformations: [{ priority: 0, type: "NONE" }],
              },
            },
            action: { block: {} },
            visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: "post_rule",
              sampledRequestsEnabled: true,
            },
          },
        ],
      });

      const template = Template.fromStack(stack);
      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
        Priority: number;
      }>;

      // Sort rules by priority
      const sortedRules = [...rules].sort((a, b) => a.Priority - b.Priority);
      const priorities = sortedRules.map(r => ({
        name: r.Name,
        priority: r.Priority,
      }));

      // Verify expected order
      expect(priorities).toEqual([
        { name: "block_xff_ip_rule_v4", priority: 1 },
        { name: "block_src_ip_rule_v4", priority: 2 },
        { name: "block_xff_ip_rule_v6", priority: 3 },
        { name: "block_src_ip_rule_v6", priority: 4 },
        { name: "pre_rule", priority: 5 },
        { name: "allow_path_rule", priority: 10 },
        { name: "allow_xff_ip_rule", priority: 11 },
        { name: "allow_src_ip_rule", priority: 12 },
        { name: "allow_xff_ip_rule_ipv6", priority: 13 },
        { name: "allow_src_ip_rule_ipv6", priority: 14 },
        { name: "allow_user_agent_rule", priority: 15 },
        { name: "bad_actors_rule", priority: 20 },
        { name: "common_rule_set", priority: 21 },
        { name: "php_rule_set", priority: 22 },
        { name: "ip_reputation_list", priority: 23 },
        { name: "anonymous_ip_list", priority: 24 },
        { name: "sql_injection_rule_set", priority: 25 },
        { name: "bot_control_rule_set", priority: 26 },
        { name: "rate_limit_rule", priority: 30 },
        { name: "post_rule", priority: 35 },
      ]);
    });
  });

  describe("Full Configuration", () => {
    it("should create WAF with all features enabled", () => {
      const { stack } = createTestStack();
      const waf = new WebApplicationFirewall(stack, "TestWAF", {
        wafName: "full-test-waf",
        scope: REGIONAL,
        activate: true,
        blockByDefault: false,
        blockedIPs: ["1.1.1.1/32"],
        blockedIPv6s: ["2001:db8:bad::/48"],
        allowedIPs: ["10.0.0.0/8"],
        allowedIPv6s: ["2001:db8:good::/48"],
        allowedPaths: ["^/health$"],
        allowedUserAgents: ["^HealthChecker.*"],
        rateLimit: 2000,
        rateLimitAggregation: "FORWARDED_IP",
        enablePhpRules: false,
        enableIpReputationList: true,
        enableAnonymousIpList: true,
        enableSqlInjection: true,
        enableBotControl: true,
        excludedAwsRules: ["SizeRestrictions_BODY"],
        enableLogging: true,
        logRetentionDays: RetentionDays.ONE_MONTH,
        logRemovalPolicy: RemovalPolicy.DESTROY,
      });

      const template = Template.fromStack(stack);

      // Verify WebACL is created
      template.hasResourceProperties("AWS::WAFv2::WebACL", {
        Name: "full-test-waf",
        Scope: "REGIONAL",
        DefaultAction: { Allow: {} },
      });

      // Verify all ARNs are exposed
      expect(waf.webAclArn).toBeDefined();
      expect(waf.ipv4AllowlistArn).toBeDefined();
      expect(waf.ipv6AllowlistArn).toBeDefined();
      expect(waf.ipv4BlocklistArn).toBeDefined();
      expect(waf.ipv6BlocklistArn).toBeDefined();

      // Verify PHP rules are disabled
      const webAcl = template.findResources("AWS::WAFv2::WebACL");
      const rules = Object.values(webAcl)[0].Properties.Rules as Array<{
        Name: string;
      }>;
      const ruleNames = rules.map(r => r.Name);
      expect(ruleNames).not.toContain("php_rule_set");

      // Verify optional rules are enabled
      expect(ruleNames).toContain("ip_reputation_list");
      expect(ruleNames).toContain("anonymous_ip_list");
      expect(ruleNames).toContain("sql_injection_rule_set");
      expect(ruleNames).toContain("bot_control_rule_set");

      // Verify logging
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: "aws-waf-logs-full-test-waf",
        RetentionInDays: 30,
      });
    });
  });
});
