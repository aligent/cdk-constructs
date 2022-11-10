import { Construct } from '@aws-cdk/core';
import * as wafv2 from '@aws-cdk/aws-wafv2';

export const REGIONAL = 'REGIONAL';
export type REGIONAL = typeof REGIONAL;

export const CLOUDFRONT = 'CLOUDFRONT';
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
   * List of Allowed IP addresses, if none are set allow_xff_ip_rule and allow_src_ip_rule rules
   * are not added
   */
  allowedIPs?: string[];
  
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
}

export class WebApplicationFirewall extends Construct {

  readonly web_acl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props: WebApplicationFirewallProps) {
    super(scope, id);

    const finalRules: wafv2.CfnWebACL.RuleProperty[] = [];
    const wafScope = props.scope ?? REGIONAL;

    if (props.allowedIPs) {
      // IP Allowlist
      const allowed_ips = new wafv2.CfnIPSet(this, 'IPSet', {
        addresses: props.allowedIPs,
        ipAddressVersion: 'IPV4',
        scope: wafScope,
        description: props.wafName
      })

      finalRules.push({
        name: 'allow_xff_ip_rule',
        priority: 2,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn,
            ipSetForwardedIpConfig: {
              fallbackBehavior : 'NO_MATCH',
              headerName : 'X-Forwarded-For',
              position : 'ANY'
            }
          }
        },
        action: { allow: {} },
        visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowXFFIPRule',
            sampledRequestsEnabled: true
        }
      });

      finalRules.push({
        name: 'allow_src_ip_rule',
        priority: 3,
        statement: {
          ipSetReferenceStatement: {
            arn: allowed_ips.attrArn
          }
        },
        action: { allow: {} },
        visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'allow_src_ip_rule',
            sampledRequestsEnabled: true
        }
      });
    }

    // Implement AWSManagedRulesKnownBadInputsRuleSet
    finalRules.push({
      name: 'bad_actors_rule',
      priority: 0,
      overrideAction: { none: {} },
      statement: {
          managedRuleGroupStatement: {
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
              vendorName: 'AWS',
              excludedRules: [
                   {name: 'Host_localhost_HEADER'},
                   {name: 'PROPFIND_METHOD'},
                   {name: 'ExploitablePaths_URIPATH'}
              ]
          }
      },
      visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'bad_actors_rule',
          sampledRequestsEnabled: true
      }
    });

    if (props.allowedPaths) {
         // Path Allowlist
         const allowed_paths = new wafv2.CfnRegexPatternSet(this, 'PathSet', {
           regularExpressionList: props.allowedPaths,
           scope: wafScope
         });

         finalRules.push({
          name: 'allow_path_rule',
          priority: 1,
          statement: {
            regexPatternSetReferenceStatement: {
              arn: allowed_paths.attrArn,
              fieldToMatch: {
                   uriPath: {}
              },
              textTransformations: [{
                   priority: 0,
                   type: 'NONE'
              }]
            }
          },
          action: { allow: {} },
          visibilityConfig: {
              cloudWatchMetricsEnabled: true,
              metricName: 'AllowPathRule',
              sampledRequestsEnabled: true
          }
        });
    }

    // UserAgent Allowlist - only when the parameter is present
    if (props.allowedUserAgents){
      const allowed_user_agent = new wafv2.CfnRegexPatternSet(this, 'UserAgent', {
        regularExpressionList: props.allowedUserAgents,
        scope: wafScope
      });

      finalRules.push({
        name: 'allow_user_agent_rule',
        priority: 4,
        statement: {
          regexPatternSetReferenceStatement: {
            arn: allowed_user_agent.attrArn,
            fieldToMatch: { singleHeader: { Name: 'User-Agent' }},
            textTransformations: [ {
              priority: 0,
              type: 'NONE'
            } ]
          }
        },
        action: { allow: {} },
        visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'allow_user_agent_rule',
            sampledRequestsEnabled: true
      }});
    }

    // Activate the rules or not
    let overrideAction: object = { count: {} }
    let action: object = { count: {} }
    if ( props.activate == true ) {
      overrideAction = { none: {} }
      action = { block: {} }
    }

    // Exclude specific rules from AWS Core Rule Group - only when the parameter is present
    const excludedAwsRules: wafv2.CfnWebACL.ExcludedRuleProperty[] = [];
    if (props.excludedAwsRules){
      props.excludedAwsRules.forEach( ruleName => {
        excludedAwsRules.push({
          name: ruleName
        });
      });
    }

    // Implement AWSManagedRulesCommonRuleSet
    finalRules.push({
      name: 'common_rule_set',
      priority: 10,
      statement: {
          managedRuleGroupStatement: {
              name: 'AWSManagedRulesCommonRuleSet',
              vendorName: 'AWS',
              excludedRules: excludedAwsRules
          }
      },
      overrideAction: overrideAction,
      visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'common_rule_set',
          sampledRequestsEnabled: true
      }
    });


    // Implement AWSManagedRulesPHPRuleSet
    finalRules.push({
      name: 'php_rule_set',
      priority: 11,
      statement: {
          managedRuleGroupStatement: {
              name: 'AWSManagedRulesPHPRuleSet',
              vendorName: 'AWS'
          }
      },
      overrideAction: overrideAction,
      visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'php_rule_set',
          sampledRequestsEnabled: true
      }
    });

    // Implement rate-based limit
    if (props.rateLimit) {
      finalRules.push({
        name: 'rate_limit_rule',
        priority: 20,
        statement: {
          rateBasedStatement: {
            aggregateKeyType: 'FORWARDED_IP',
            forwardedIpConfig: {
              fallbackBehavior : 'MATCH',
              headerName : 'X-Forwarded-For'},
              limit: props.rateLimit
            }
        },
        action: action,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: 'rate_limit_rule',
          sampledRequestsEnabled: true
        }
      });
    }

    const defaultAction = props.blockByDefault ? { block: {} }  : { allow: {} };

    this.web_acl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: props.wafName,
      defaultAction: defaultAction,
      scope: wafScope,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'WebAcl',
        sampledRequestsEnabled: true,
      },
      rules: finalRules
    });

    // If any resources associations have been passed loop through them and add an association with WebACL
    if (props.associations) {
      props.associations.forEach((association, index) => {
        new wafv2.CfnWebACLAssociation(this, 'WebACLAssociation' + index, {
          // If the application stack has had the ARN exported, importValue could be used as below:
          // resourceArn: cdk.Fn.importValue("WAFTestALB"),
          resourceArn: association,
          webAclArn: this.web_acl.attrArn
        })
      });
    }
  }
}
