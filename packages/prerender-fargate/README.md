# Prerender in Fargate
A construct to host [Prerender](https://github.com/prerender/prerender) in Fargate. 

## Props
`prerenderName`: Name of the Prerender service
`domainName`: Domain name for Prerender
`vpcId`: VPC to host Prerender in
`bucketName`: Optional S3 bucket name
`expirationDays`: Optional days until items expire in bucket (default to 7 days)
`basicAuthList`: List of basic auth credentials to accept
`certificateArn`: Certificate arn to match the domain
