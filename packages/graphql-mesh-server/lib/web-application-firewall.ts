import { CfnWebACL, CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export enum Action {
  BLOCK = "BLOCK",
  ALLOW = "ALLOW",
}

export enum Scope {
  CLOUDFRONT = "CLOUDFRONT",
  REGIONAL = "REGIONAL",
}

export enum ManagedRule {
  BOT_CONTROL_RULE_SET = "AWSManagedRulesBotControlRuleSet",
  KNOWN_BAD_INPUTS_RULE_SET = "AWSManagedRulesKnownBadInputsRuleSet",
  COMMON_RULE_SET = "AWSManagedRulesCommonRuleSet",
  ANNONYMOUS_IP_LIST = "AWSManagedRulesAnonymousIpList",
  AMAZON_IP_REPUTATION_LIST = "AWSManagedRulesAmazonIpReputationList",
  ADMIN_PROTECTION_RULE_SET = "AWSManagedRulesAdminProtectionRuleSet",
  SQLI_RULE_SET = "AWSManagedRulesSQLiRuleSet",
  PHP_RULE_SET = "AWSManagedRulesPHPRuleSet",
}

export interface VisibilityConfig {
  /**
   * Whether cloudwatch metrics are enabled or nor
   */
  cloudWatchMetricsEnabled: boolean;

  /**
   * Name of the metric in cloudwatch
   */
  metricName: string;

  /**
   * Whether to keep samples of blocked requests
   */
  sampledRequestsEnabled: boolean;
}

export interface AWSManagedRule {
  /**
   * Which AWS Rule to add
   */
  name: ManagedRule;

  /**
   * @default to the name property
   */
  metricName?: string;

  /**
   * @default false
   */
  sampledRequestsEnabled?: boolean;

  /**
   * Any rules from this ruleset you wish to disable/exclude
   */
  excludedRules?: Array<{
    name: string;
  }>;

  /**
   * Whether to override the default action to COUNT
   */
  count?: boolean;
}

export interface WebApplicationFirewallProps {
  /**
   * Name of the WAF
   */
  name?: string;

  /**
   * The action to perform if none of the `Rules` contained in the `WebACL` match.
   * @default Action.ALLOW
   */
  defaultAction?: Action;

  /**
   * Specifies whether this is for an Amazon CloudFront distribution or for a regional application.
   * @default Scope.REGIONAL
   */
  scope?: Scope;

  /**
   * Default visibility configuration
   */
  visibilityConfig: VisibilityConfig;

  /**
   * List of AWS Managed rules to add to the WAF
   */
  managedRules?: AWSManagedRule[];

  /**
   * List of custom rules
   */
  rules?: CfnWebACL.RuleProperty[];
}

export class WebApplicationFirewall extends Construct {
  readonly acl: CfnWebACL;
  readonly associations: CfnWebACLAssociation[];

  constructor(
    scope: Construct,
    id: string,
    props: WebApplicationFirewallProps
  ) {
    super(scope, id);

    let defaultAction: CfnWebACL.DefaultActionProperty = { allow: {} };

    if (props.defaultAction == Action.BLOCK) {
      defaultAction = { block: {} };
    }

    this.associations = [];

    const rules: CfnWebACL.RuleProperty[] = props.rules || [];

    // Convert from our AWSManagedRule type to a CfnWebACL.RuleProperty
    if (props.managedRules) {
      props.managedRules.forEach((rule, index) => {
        rules.push({
          name: rule.name,
          priority: index,
          visibilityConfig: {
            // if no metric name is passed then don't enable metrics
            cloudWatchMetricsEnabled: rule.metricName ? true : false,
            // Default to the rule name if a metric name isn't passed
            metricName: rule.metricName || rule.name,
            sampledRequestsEnabled: rule.sampledRequestsEnabled || false,
          },
          statement: {
            managedRuleGroupStatement: {
              name: rule.name,
              vendorName: "AWS",
              excludedRules: rule.excludedRules || [],
            },
          },
          overrideAction: rule.count ? { count: {} } : { none: {} },
        });
      });
    }

    this.acl = new CfnWebACL(this, "WebAcl", {
      name: props.name,
      defaultAction,
      scope: props.scope || Scope.REGIONAL,
      visibilityConfig: props.visibilityConfig,
      rules: rules,
    });
  }

  public addAssociation(id: string, resourceArn: string) {
    this.associations.push(
      new CfnWebACLAssociation(this, id, {
        webAclArn: this.acl.attrArn,
        resourceArn,
      })
    );
  }
}
