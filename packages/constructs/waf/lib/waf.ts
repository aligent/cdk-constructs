import { aws_wafv2, RemovalPolicy } from "aws-cdk-lib";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export const REGIONAL = "REGIONAL";
export type REGIONAL = typeof REGIONAL;

export const CLOUDFRONT = "CLOUDFRONT";
export type CLOUDFRONT = typeof CLOUDFRONT;

/**
 * An additional rate-based rule. See the README for the priority layout.
 */
export interface RateLimitRule {
  /**
   * Rule name, also used as its CloudWatch metric name. Must be unique within the WebACL.
   */
  name: string;

  /**
   * Maximum requests per aggregation bucket within the evaluation window.
   */
  limit: number;

  /**
   * How requests are aggregated into buckets:
   * - `IP`: one bucket per source IP
   * - `CONSTANT`: one bucket for every request matching `scopeDownStatement` (required)
   * - `CUSTOM_KEYS`: one bucket per combination of `customKeys` values (required)
   */
  aggregateKeyType: "IP" | "CONSTANT" | "CUSTOM_KEYS";

  /**
   * Aggregation keys, for `CUSTOM_KEYS`.
   */
  customKeys?: aws_wafv2.CfnWebACL.RateBasedStatementCustomKeyProperty[];

  /**
   * Only count and limit requests matching this statement. Required for `CONSTANT`.
   */
  scopeDownStatement?: aws_wafv2.CfnWebACL.StatementProperty;

  /**
   * Evaluation window in seconds. Default: 300
   */
  evaluationWindowSec?: 60 | 120 | 300 | 600;

  /**
   * Action when the limit is exceeded. Default: follows `activate`
   * ('block' when activated, otherwise 'count').
   */
  action?: "block" | "count";

  /**
   * Response sent when this rule blocks, e.g. a `429` instead of WAF's default `403`.
   * Ignored while the rule only counts.
   *
   * WAF prefixes custom response header names with `x-amzn-waf-`, so this offers no
   * headers: a `Retry-After` would arrive as `x-amzn-waf-retry-after`.
   */
  customResponse?: RateLimitCustomResponse;
}

export interface RateLimitCustomResponse {
  /**
   * HTTP status code, 200-599. Typically `429`.
   */
  statusCode: number;

  /**
   * Optional response body. Stored in the WebACL's `customResponseBodies` under the rule's name.
   */
  body?: {
    content: string;
    contentType: "APPLICATION_JSON" | "TEXT_PLAIN" | "TEXT_HTML";
  };
}

export interface WebApplicationFirewallProps {
  /**
   * Whether this WAF is global or regional
   */
  scope?: REGIONAL | CLOUDFRONT;

  /**
   * true for blocking mode, false for Count-only mode
   */
  activate?: boolean;

  /**
   * List of Allowed IPv4 addresses, if neither allowedIPs nor allowedIPsIPv6 are set allow_xff_ip_rule and allow_src_ip_rule rules
   * are not added
   */
  allowedIPs?: string[];

  /**
   * List of Allowed IPv6 addresses, if neither allowedIPs nor allowedIPsIPv6 are set allow_xff_ip_rule and allow_src_ip_rule rules
   * are not added
   */
  allowedIPv6s?: string[];

  /**
   * List of IPv4 addresses to block. Requests from these IPs will be blocked.
   */
  blockedIPs?: string[];

  /**
   * List of IPv6 addresses to block. Requests from these IPs will be blocked.
   */
  blockedIPv6s?: string[];

  /**
   * Explicit paths to allow through the waf
   */
  allowedPaths?: string[];

  /**
   * Default Rate limit count, if not set the rate limit rule will not be added
   */
  rateLimit?: number;

  /**
   * Explicit allow of user agents, if not set rule will not be added
   */
  allowedUserAgents?: string[];

  /**
   * A list of AWS Rules to ignore
   */
  excludedAwsRules?: string[];

  /**
   * A list of ARNs to associate with the WAF
   */
  associations?: string[];

  /**
   * Name of the WAF
   */
  wafName: string;

  /**
   * Whether to block by default
   */
  blockByDefault?: boolean;

  /**
   * Custom rules that are evaluated before the default rules defined by this construct.
   * Priority numbers must be smaller than 10
   */
  preProcessCustomRules?: aws_wafv2.CfnWebACL.RuleProperty[];

  /**
   * Custom rules that are evaluated after the default rules defined by this construct
   * Priority numbers must be equal to or bigger than 30
   */
  postProcessCustomRules?: aws_wafv2.CfnWebACL.RuleProperty[];

  /**
   * Enable CloudWatch logging. Default: true
   */
  enableLogging?: boolean;

  /**
   * Define CloudWatch log retention period. Default: 1 year
   */
  logRetentionDays?: RetentionDays;

  /**
   * Define CloudWatch log removal policy. Default: RETAIN
   */
  logRemovalPolicy?: RemovalPolicy;

  /**
   * Enable AWS Managed Rules IP Reputation List. Default: false
   * This rule group contains rules based on Amazon internal threat intelligence.
   */
  enableIpReputationList?: boolean;

  /**
   * Enable AWS Managed Rules Anonymous IP List. Default: false
   * This rule group contains rules to block requests from services that permit
   * the obfuscation of viewer identity (VPNs, proxies, Tor nodes, hosting providers).
   */
  enableAnonymousIpList?: boolean;

  /**
   * Enable AWS Managed Rules SQL Injection Rule Set. Default: false
   * This rule group contains rules to block SQL injection attacks.
   */
  enableSqlInjection?: boolean;

  /**
   * Enable AWS Managed Rules Bot Control Rule Set. Default: false
   * WARNING: This rule group has additional costs. See AWS WAF pricing for details.
   * This rule group provides protection against automated bots.
   */
  enableBotControl?: boolean;

  /**
   * Enable PHP-specific protection rules. Default: true (for backwards compatibility)
   * Set to false for non-PHP workloads to avoid false positives.
   */
  enablePhpRules?: boolean;

  /**
   * How to aggregate requests for rate limiting. Default: 'FORWARDED_IP'
   * - 'FORWARDED_IP': Use the X-Forwarded-For header (for requests behind load balancers/proxies)
   * - 'IP': Use the source IP address directly
   */
  rateLimitAggregation?: "FORWARDED_IP" | "IP";

  /**
   * Additional rate-based rules, alongside (or instead of) the legacy `rateLimit` rule.
   * Entry `i` gets priority 31 + i, after the legacy rule (30). Priorities and names
   * are checked for uniqueness across the whole WebACL at synth time.
   */
  rateLimitRules?: RateLimitRule[];
}

export class WebApplicationFirewall extends Construct {
  readonly web_acl: aws_wafv2.CfnWebACL;
  readonly webAclArn: string;
  readonly ipv4AllowlistArn?: string;
  readonly ipv6AllowlistArn?: string;
  readonly ipv4BlocklistArn?: string;
  readonly ipv6BlocklistArn?: string;

  constructor(
    scope: Construct,
    id: string,
    props: WebApplicationFirewallProps
  ) {
    super(scope, id);

    const finalRules: aws_wafv2.CfnWebACL.RuleProperty[] = [];
    const wafScope = props.scope ?? REGIONAL;

    // preprocess custom rules
    if (props.preProcessCustomRules) {
      finalRules.push(...props.preProcessCustomRules);
    }

    // IPv4 Blocklist
    if (props.blockedIPs && props.blockedIPs.length > 0) {
      const blocked_ips_v4 = new aws_wafv2.CfnIPSet(this, "BlockedIPSet-IPv4", {
        addresses: props.blockedIPs,
        ipAddressVersion: "IPV4",
        scope: wafScope,
        description: `${props.wafName} - Blocked IPv4 addresses`,
      });
      this.ipv4BlocklistArn = blocked_ips_v4.attrArn;

      finalRules.push({
        name: "block_xff_ip_rule_v4",
        priority: 1,
        statement: {
          ipSetReferenceStatement: {
            arn: blocked_ips_v4.attrArn,
            ipSetForwardedIpConfig: {
              fallbackBehavior: "NO_MATCH",
              headerName: "X-Forwarded-For",
              position: "ANY",
            },
          },
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "BlockXFFIPRuleV4",
          sampledRequestsEnabled: true,
        },
      });

      finalRules.push({
        name: "block_src_ip_rule_v4",
        priority: 2,
        statement: {
          ipSetReferenceStatement: {
            arn: blocked_ips_v4.attrArn,
          },
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "BlockSrcIPRuleV4",
          sampledRequestsEnabled: true,
        },
      });
    }

    // IPv6 Blocklist
    if (props.blockedIPv6s && props.blockedIPv6s.length > 0) {
      const blocked_ips_v6 = new aws_wafv2.CfnIPSet(this, "BlockedIPSet-IPv6", {
        addresses: props.blockedIPv6s,
        ipAddressVersion: "IPV6",
        scope: wafScope,
        description: `${props.wafName} - Blocked IPv6 addresses`,
      });
      this.ipv6BlocklistArn = blocked_ips_v6.attrArn;

      finalRules.push({
        name: "block_xff_ip_rule_v6",
        priority: 3,
        statement: {
          ipSetReferenceStatement: {
            arn: blocked_ips_v6.attrArn,
            ipSetForwardedIpConfig: {
              fallbackBehavior: "NO_MATCH",
              headerName: "X-Forwarded-For",
              position: "ANY",
            },
          },
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "BlockXFFIPRuleV6",
          sampledRequestsEnabled: true,
        },
      });

      finalRules.push({
        name: "block_src_ip_rule_v6",
        priority: 4,
        statement: {
          ipSetReferenceStatement: {
            arn: blocked_ips_v6.attrArn,
          },
        },
        action: { block: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "BlockSrcIPRuleV6",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.allowedPaths) {
      // Path Allowlist
      const allowed_paths = new aws_wafv2.CfnRegexPatternSet(this, "PathSet", {
        regularExpressionList: props.allowedPaths,
        scope: wafScope,
      });

      finalRules.push({
        name: "allow_path_rule",
        priority: 10,
        statement: {
          regexPatternSetReferenceStatement: {
            arn: allowed_paths.attrArn,
            fieldToMatch: {
              uriPath: {},
            },
            textTransformations: [
              {
                priority: 0,
                type: "NONE",
              },
            ],
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "AllowPathRule",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.allowedIPs) {
      // IPv4 Allowlist
      const allowed_ips = new aws_wafv2.CfnIPSet(this, "IPSet-IPv4", {
        addresses: props.allowedIPs,
        ipAddressVersion: "IPV4",
        scope: wafScope,
        description: props.wafName,
      });
      this.ipv4AllowlistArn = allowed_ips.attrArn;

      finalRules.push({
        name: "allow_xff_ip_rule",
        priority: 11,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn,
            ipSetForwardedIpConfig: {
              fallbackBehavior: "NO_MATCH",
              headerName: "X-Forwarded-For",
              position: "ANY",
            },
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "AllowXFFIPRule",
          sampledRequestsEnabled: true,
        },
      });

      finalRules.push({
        name: "allow_src_ip_rule",
        priority: 12,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn,
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "allow_src_ip_rule",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.allowedIPv6s) {
      // IPv6 Allowlist
      const allowed_ips = new aws_wafv2.CfnIPSet(this, "IPSet-IPv6", {
        addresses: props.allowedIPv6s,
        ipAddressVersion: "IPV6",
        scope: wafScope,
        description: props.wafName,
      });
      this.ipv6AllowlistArn = allowed_ips.attrArn;

      finalRules.push({
        name: "allow_xff_ip_rule_ipv6",
        priority: 13,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn,
            ipSetForwardedIpConfig: {
              fallbackBehavior: "NO_MATCH",
              headerName: "X-Forwarded-For",
              position: "ANY",
            },
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "AllowXFFIPRule",
          sampledRequestsEnabled: true,
        },
      });

      finalRules.push({
        name: "allow_src_ip_rule_ipv6",
        priority: 14,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn,
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "allow_src_ip_rule",
          sampledRequestsEnabled: true,
        },
      });
    }

    // UserAgent Allowlist - only when the parameter is present
    if (props.allowedUserAgents) {
      const allowed_user_agent = new aws_wafv2.CfnRegexPatternSet(
        this,
        "UserAgent",
        {
          regularExpressionList: props.allowedUserAgents,
          scope: wafScope,
        }
      );

      finalRules.push({
        name: "allow_user_agent_rule",
        priority: 15,
        statement: {
          regexPatternSetReferenceStatement: {
            arn: allowed_user_agent.attrArn,
            fieldToMatch: { singleHeader: { Name: "User-Agent" } },
            textTransformations: [
              {
                priority: 0,
                type: "NONE",
              },
            ],
          },
        },
        action: { allow: {} },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "allow_user_agent_rule",
          sampledRequestsEnabled: true,
        },
      });
    }

    // Activate the rules or not
    let overrideAction: object = { count: {} };
    let action: object = { count: {} };
    if (props.activate == true) {
      overrideAction = { none: {} };
      action = { block: {} };
    }

    // Exclude specific rules from AWS Core Rule Group - only when the parameter is present
    const excludedAwsRules: aws_wafv2.CfnWebACL.ExcludedRuleProperty[] = [];
    if (props.excludedAwsRules) {
      props.excludedAwsRules.forEach(ruleName => {
        excludedAwsRules.push({
          name: ruleName,
        });
      });
    }

    // Implement AWSManagedRulesKnownBadInputsRuleSet
    finalRules.push({
      name: "bad_actors_rule",
      priority: 20,
      overrideAction: { none: {} },
      statement: {
        managedRuleGroupStatement: {
          name: "AWSManagedRulesKnownBadInputsRuleSet",
          vendorName: "AWS",
          excludedRules: [
            { name: "Host_localhost_HEADER" },
            { name: "PROPFIND_METHOD" },
            { name: "ExploitablePaths_URIPATH" },
          ],
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "bad_actors_rule",
        sampledRequestsEnabled: true,
      },
    });

    // Implement AWSManagedRulesCommonRuleSet
    finalRules.push({
      name: "common_rule_set",
      priority: 21,
      statement: {
        managedRuleGroupStatement: {
          name: "AWSManagedRulesCommonRuleSet",
          vendorName: "AWS",
          excludedRules: excludedAwsRules,
        },
      },
      overrideAction: overrideAction,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "common_rule_set",
        sampledRequestsEnabled: true,
      },
    });

    // Implement AWSManagedRulesPHPRuleSet (optional, default: true for backwards compatibility)
    if (props.enablePhpRules ?? true) {
      finalRules.push({
        name: "php_rule_set",
        priority: 22,
        statement: {
          managedRuleGroupStatement: {
            name: "AWSManagedRulesPHPRuleSet",
            vendorName: "AWS",
          },
        },
        overrideAction: overrideAction,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "php_rule_set",
          sampledRequestsEnabled: true,
        },
      });
    }

    // Optional AWS Managed Rules
    if (props.enableIpReputationList) {
      finalRules.push({
        name: "ip_reputation_list",
        priority: 23,
        statement: {
          managedRuleGroupStatement: {
            name: "AWSManagedRulesAmazonIpReputationList",
            vendorName: "AWS",
          },
        },
        overrideAction: overrideAction,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "ip_reputation_list",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.enableAnonymousIpList) {
      finalRules.push({
        name: "anonymous_ip_list",
        priority: 24,
        statement: {
          managedRuleGroupStatement: {
            name: "AWSManagedRulesAnonymousIpList",
            vendorName: "AWS",
          },
        },
        overrideAction: overrideAction,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "anonymous_ip_list",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.enableSqlInjection) {
      finalRules.push({
        name: "sql_injection_rule_set",
        priority: 25,
        statement: {
          managedRuleGroupStatement: {
            name: "AWSManagedRulesSQLiRuleSet",
            vendorName: "AWS",
          },
        },
        overrideAction: overrideAction,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "sql_injection_rule_set",
          sampledRequestsEnabled: true,
        },
      });
    }

    if (props.enableBotControl) {
      finalRules.push({
        name: "bot_control_rule_set",
        priority: 26,
        statement: {
          managedRuleGroupStatement: {
            name: "AWSManagedRulesBotControlRuleSet",
            vendorName: "AWS",
          },
        },
        overrideAction: overrideAction,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "bot_control_rule_set",
          sampledRequestsEnabled: true,
        },
      });
    }

    // Implement rate-based limit
    if (props.rateLimit) {
      const aggregationType = props.rateLimitAggregation ?? "FORWARDED_IP";
      const rateBasedStatement: aws_wafv2.CfnWebACL.RateBasedStatementProperty =
        aggregationType === "FORWARDED_IP"
          ? {
              aggregateKeyType: "FORWARDED_IP",
              forwardedIpConfig: {
                fallbackBehavior: "MATCH",
                headerName: "X-Forwarded-For",
              },
              limit: props.rateLimit,
            }
          : {
              aggregateKeyType: "IP",
              limit: props.rateLimit,
            };

      finalRules.push({
        name: "rate_limit_rule",
        priority: 30,
        statement: {
          rateBasedStatement: rateBasedStatement,
        },
        action: action,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "rate_limit_rule",
          sampledRequestsEnabled: true,
        },
      });
    }

    // Additional rate-based rules, after the legacy rule at 30
    const customResponseBodies: Record<
      string,
      aws_wafv2.CfnWebACL.CustomResponseBodyProperty
    > = {};
    props.rateLimitRules?.forEach((rule, index) => {
      const blocks = rateLimitRuleBlocks(rule, action);
      finalRules.push(buildRateLimitRule(rule, 31 + index, blocks));
      // Only a blocking rule sends its body; an unused body would just sit in the WebACL
      if (blocks && rule.customResponse?.body) {
        customResponseBodies[rule.name] = rule.customResponse.body;
      }
    });

    // postprocess custom rules
    if (props.postProcessCustomRules) {
      finalRules.push(...props.postProcessCustomRules);
    }

    validateUniqueRules(finalRules);

    // Define Default action
    const defaultAction = props.blockByDefault ? { block: {} } : { allow: {} };

    this.web_acl = new aws_wafv2.CfnWebACL(this, "WebAcl", {
      name: props.wafName,
      defaultAction: defaultAction,
      scope: wafScope,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: "WebAcl",
        sampledRequestsEnabled: true,
      },
      rules: finalRules,
      ...(Object.keys(customResponseBodies).length > 0 && {
        customResponseBodies,
      }),
    });
    this.webAclArn = this.web_acl.attrArn;

    // If any resources associations have been passed loop through them and add an association with WebACL
    if (props.associations) {
      props.associations.forEach((association, index) => {
        new aws_wafv2.CfnWebACLAssociation(this, "WebACLAssociation" + index, {
          // If the application stack has had the ARN exported, importValue could be used as below:
          // resourceArn: cdk.Fn.importValue("WAFTestALB"),
          resourceArn: association,
          webAclArn: this.web_acl.attrArn,
        });
      });
    }

    const enableLogging = props.enableLogging ?? true;
    if (enableLogging) {
      const wafLogGroup = new LogGroup(this, `WAF-Logs-${this.web_acl.name}`, {
        retention: props.logRetentionDays
          ? props.logRetentionDays
          : RetentionDays.ONE_YEAR,
        removalPolicy: props.logRemovalPolicy
          ? props.logRemovalPolicy
          : RemovalPolicy.RETAIN,
        logGroupName: `aws-waf-logs-${this.web_acl.name}`,
      });
      new aws_wafv2.CfnLoggingConfiguration(this, "CloudWatchLogging", {
        logDestinationConfigs: [`${wafLogGroup.logGroupArn}`],
        resourceArn: this.web_acl.attrArn,
      });
    }
  }
}

/**
 * Whether a rate rule blocks: its own `action` if set, otherwise whatever `activate` chose.
 */
function rateLimitRuleBlocks(
  rule: RateLimitRule,
  defaultAction: object
): boolean {
  if (rule.action) {
    return rule.action === "block";
  }
  return "block" in defaultAction;
}

/**
 * A rate rule's action. A blocking rule with a `customResponse` sends that status code, and its
 * body (registered under the rule's name) if it has one.
 */
function rateLimitRuleAction(
  rule: RateLimitRule,
  blocks: boolean
): aws_wafv2.CfnWebACL.RuleActionProperty {
  if (!blocks) {
    return { count: {} };
  }

  const customResponse = rule.customResponse;
  if (!customResponse) {
    return { block: {} };
  }

  return {
    block: {
      customResponse: {
        responseCode: customResponse.statusCode,
        customResponseBodyKey: customResponse.body ? rule.name : undefined,
      },
    },
  };
}

function buildRateLimitRule(
  rule: RateLimitRule,
  priority: number,
  blocks: boolean
): aws_wafv2.CfnWebACL.RuleProperty {
  if (rule.aggregateKeyType === "CUSTOM_KEYS" && !rule.customKeys?.length) {
    throw new Error(
      `rateLimitRules "${rule.name}": aggregateKeyType CUSTOM_KEYS requires customKeys`
    );
  }
  if (rule.aggregateKeyType === "CONSTANT" && !rule.scopeDownStatement) {
    throw new Error(
      `rateLimitRules "${rule.name}": aggregateKeyType CONSTANT requires a scopeDownStatement`
    );
  }

  return {
    name: rule.name,
    priority,
    statement: {
      rateBasedStatement: {
        aggregateKeyType: rule.aggregateKeyType,
        limit: rule.limit,
        customKeys: rule.customKeys,
        scopeDownStatement: rule.scopeDownStatement,
        evaluationWindowSec: rule.evaluationWindowSec,
      },
    },
    action: rateLimitRuleAction(rule, blocks),
    visibilityConfig: {
      cloudWatchMetricsEnabled: true,
      metricName: rule.name,
      sampledRequestsEnabled: true,
    },
  };
}

/**
 * AWS WAF rejects a WebACL whose rules share a priority or a name; fail at synth instead.
 */
function validateUniqueRules(rules: aws_wafv2.CfnWebACL.RuleProperty[]): void {
  const byPriority = new Map<number, string>();
  const names = new Set<string>();

  for (const rule of rules) {
    const existing = byPriority.get(rule.priority);
    if (existing !== undefined) {
      throw new Error(
        `WAF rules "${existing}" and "${rule.name}" both use priority ${rule.priority}; rule priorities must be unique`
      );
    }
    byPriority.set(rule.priority, rule.name);

    if (names.has(rule.name)) {
      throw new Error(
        `More than one WAF rule is named "${rule.name}"; rule names must be unique`
      );
    }
    names.add(rule.name);
  }
}
