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
 - `notificationArn?`: SNS Topic ARN to publish deployment notifications to