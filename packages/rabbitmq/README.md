# Aligent AWS RabbitMQ

## Overview
This repository defines a CDK construct for hosting a RabbitMQ cluster within AWS.
It can be imported and used within CDK applications.

## Example
The following CDK snippet can be used to provision the static hosting stack.

```
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { RabbitMq } from '@aligent/cdk-rabbitmq'
import { Construct } from '@aws-cdk/core';

const mqStackProps = {
    env: {
        region: 'ap-southeast-2',
        account: 'account-id-goes-here',
    },
    rabbitMQProps: {
       autoMinorVersionUpgrade: true,
       brokerName: 'brokerName',
       deploymentMode: 'SINGLE_INSTANCE',
       engineType: 'RABBITMQ',
       engineVersion: '3.8.6',
       hostInstanceType: 'mq.t3.micro',
       publiclyAccessible: false,
       users: [{
            username: 'username',
            password: 'password'
       }],
       logs: { general: true },
       maintenanceWindowStartTime: {
            dayOfWeek: 'Sunday',
            timeOfDay: '00:00',
            timeZone: 'Australia/Sydney'
       },
    },
    applicationVpcId: string;
    applicationSecurityGroupId: string;
};

const app = new cdk.App();
class RabbitMQStack extends Stack {
  constructor(scope: Construct, id: string, props: hostingStackProps) {
    super(scope, id, props);

    new RabbitMQ(scope, 'rabbitmq', props.rabbitMQProps);
  }
}

new RabbitMQStack(scope, 'rabbit-mq-stack', mqStackProps);
```

## Connection and communication
Applications talk to RabbitMQ via amqps protocol(5671/tcp). For visual management, use SSH tunneling.
1. Add the below in your local `~/.ssh/config` file with *profile* and *path* updated (works only for SSM-enabled environments):

        host i-*
            User ec2-user
            ProxyCommand sh -c "aws --profile <TargetAccountProfile> ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
            IdentityFile /path/to/ssh_key/for/backend_instance

2. Find RabbitMQ endpoint hostname and the application  BE instance ID to run this command that will open a ssh connection (not an interactive shell with the `-N` flag):

        ssh -N -L <random_local_port>:<RabbitMQ_endpoint>:443 <BEInstanceID>

    for example,

        ssh -L 56710:b-abcd-ef12-3456-7890-abcdef123456.mq.ap-southeast-2.amazonaws.com:443 i-abcdef1234567890

3. Open your web browser to access to the GUI (get id/pw from environments.ts)

        https://localhost:<random_local_port_from_above>

    for example,

        https://localhost:56710


## Local development
[NPM link](https://docs.npmjs.com/cli/v7/commands/npm-link) can be used to develop the module locally.
1. Pull this repository locally
2. `cd` into this repository
3. run `npm link`
4. `cd` into the downstream repo (target project, etc) and run `npm link 'aws-rabbitmq-stack'`
The downstream repository should now include a symlink to this module. Allowing local changes to be tested before pushing.
