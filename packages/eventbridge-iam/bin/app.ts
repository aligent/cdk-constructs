#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import * as ssm from '@aws-cdk/aws-ssm';
import { 
   PolicyStatement, 
   Effect,
   Group,
   User
} from '@aws-cdk/aws-iam';

const EVENT_SOURCE = process.env.EVENT_SOURCE
if (!EVENT_SOURCE) {
     throw Error('No EVENT_SOURCE defined');
}
const HYPHENATED_EVENT_SOURCE = EVENT_SOURCE.split('.').join('-');
class EventBridgeIAM extends cdk.Stack {

     constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
          super(scope, id, props);

          // Version will be used for auditing which role is being used by projects.
          // This should only be updated for BREAKING changes.
          const version = '1'

          const eventbridgeUser = new User(this, `eventbridge-user-${HYPHENATED_EVENT_SOURCE}`, {
               userName: `eventbridge-user-${HYPHENATED_EVENT_SOURCE}`,
          })

          const eventbridgeGroup = new Group(this, `eventbridge-users-${HYPHENATED_EVENT_SOURCE}`);

          eventbridgeGroup.addToPolicy(
               new PolicyStatement({
                    effect: Effect.ALLOW,
                    resources: ['*'],
                    actions: [
                         "events:PutEvents",
                    ],
                    conditions: {
                         "StringEquals": {
                              "events:source": EVENT_SOURCE
                         }
                    }
               })
          );

          eventbridgeUser.addToGroup(eventbridgeGroup);

          const parameterName = `/eventbridge-user/${HYPHENATED_EVENT_SOURCE}/version`;

          new ssm.StringParameter(this, 'EventBridgeIAMVersion', {
               parameterName: parameterName,
               description: 'The version of the eventbridge-iam resources',
               stringValue: version
          });
     }

}

const app = new cdk.App();
new EventBridgeIAM(app, `eventbridge-iam-${HYPHENATED_EVENT_SOURCE}`, { description: "This stack provisions an IAM user with privilage to post events into the default EventBride"});
