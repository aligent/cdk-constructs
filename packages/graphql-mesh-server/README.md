# Prerender in Fargate
A construct host [GraphQL Mesh](https://the-guild.dev/graphql/mesh) server in Fargate. 

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
