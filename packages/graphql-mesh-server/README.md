# GraphQL Mesh in Fargate
A construct host [GraphQL Mesh](https://the-guild.dev/graphql/mesh) server in Fargate. 

## Deployment notifications
If notificationArn is set this construct creates a CodeStar notification rule, SNS topic and Lambda function to receive notifications for codepipeline executions and forward them to another SNS topic. This is so that you can setup AWS Chatbot either in this account OR another account and forward the notifications there. 

## Props

- `vpc?`: VPC to attach Redis and Fargate instances to (default: create a vpc)
- `vpcName?`: If no VPC is provided create one with this name (default: 'graphql-server-vpc')
- `cacheNodeType?`: Cache node type (default: 'cache.t2.micro')
- `repository?`: Repository to pull the container image from 
- `certificateArn:` ARN of the certificate to add to the load balancer
- `minCapacity?`: Minimum number of Fargate instances
- `maxCapacity?`: Maximum number of Fargate instances
- `cpu?`: Amount of vCPU per Fargate instance (default: 512)
- `memory?`: Amount of memory per Fargate instance (default: 1024)
- `redis?`: Redis instance to use for mesh caching
- `secrets?`: SSM values to pass through to the container as secrets
- `cpuScalingSteps?`: Pass custom CPU scaling steps (default: [{ upper: 30, change: -1 }, { lower: 50, change: +1 }, { lower: 85, change: +3 }])
- `notificationArn?`: SNS Topic ARN to publish deployment notifications to
- `notificationRegion?`: Region of the SNS Topic that deployment notifications are sent to
- `blockedIps?`: List of IPv4 addresses to block
- `blockedIpPriority?`: The WAF rule priority (defaults to 2)
- `blockedIpv6s?`: List of IPv6 addresses to block
- `blockedIpv6Priority?`: The WAF rule priority (defaults to 3)
- `wafManagedRules?`: List of AWS Managed rules to add to the WAF
- `wafRules?`: List of custom rules
- `rateLimit?`: The limit on requests per 5-minute period. If provided, rate limiting will be enabled
- `rateLimitPriority?`: The WAF rule priority. Only used when a rateLimit value is provided (defaults to 10)
- `containerInsights?`: Enable/disable container insights (defaults to true)
- `logStreamPrefix?`: Log stream prefix (defaults to 'graphql-server')
- `snsTopic?`: Optional SNS topic to subscribe all alarms to
- `additionalAlarms?`: Any additional custom alarms
