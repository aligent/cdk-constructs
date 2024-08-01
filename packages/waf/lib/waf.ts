import { aws_wafv2 } from "aws-cdk-lib";
import { Construct } from "constructs";

export const REGIONAL = "REGIONAL";
export type REGIONAL = typeof REGIONAL;

export const CLOUDFRONT = "CLOUDFRONT";
export type CLOUDFRONT = typeof CLOUDFRONT;

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
}

export class WebApplicationFirewall extends Construct {
  readonly web_acl: aws_wafv2.CfnWebACL;

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

    // Implement AWSManagedRulesPHPRuleSet
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

    // Implement rate-based limit
    if (props.rateLimit) {
      finalRules.push({
        name: "rate_limit_rule",
        priority: 30,
        statement: {
          rateBasedStatement: {
            aggregateKeyType: "FORWARDED_IP",
            forwardedIpConfig: {
              fallbackBehavior: "MATCH",
              headerName: "X-Forwarded-For",
            },
            limit: props.rateLimit,
          },
        },
        action: action,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "rate_limit_rule",
          sampledRequestsEnabled: true,
        },
      });
    }

    // postprocess custom rules
    if (props.postProcessCustomRules) {
      finalRules.push(...props.postProcessCustomRules);
    }

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
    });

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
  }
}
