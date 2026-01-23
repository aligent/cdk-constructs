# GraphQL Mesh in Fargate

![TypeScript version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/typescript?filename=packages/constructs/graphql-mesh-server/package.json&color=red) ![AWS CDK version](https://img.shields.io/github/package-json/dependency-version/aligent/cdk-constructs/dev/aws-cdk?filename=packages/constructs/graphql-mesh-server/package.json) ![NPM version](https://img.shields.io/npm/v/%40aligent%2Fcdk-graphql-mesh-server?color=green)

A construct to host a [GraphQL Mesh](https://the-guild.dev/graphql/mesh) server in Fargate. 

![graphql mesh server hosting diagram](docs/graphql_mesh_server_hosting.png)

## Deployment notifications
If notificationArn is set this construct creates a CodeStar notification rule, SNS topic and Lambda function to receive notifications for codepipeline executions and forward them to another SNS topic. This is so that you can setup AWS Chatbot either in this account OR another account and forward the notifications there. 

## Maintenance Mode
A set of API Gateway functions are deployed by default as part of this construct that allow the mesh to be placed in / out of "Maintenance Mode" by creating JSON files on the filesystem shared by the mesh containers. 

### Maintenance Mode API
This API will enable / disable mainteance mode by toggling the file name on the shared filesystem from `maintenance.disabled` to `maintenance.enabled`. The file will contain a list of sites that should be in maintance mode. If ANY site is in maintenance mode the file will be named `maintenance.enabled`, it is then the responsiblity of the mesh to check the contents of that file to determine whether or not to allow the request.

#### GET /maintenance
Will return a list of sites currently in / out of maintenance mode.

Example Response
```json
{
    "sites": {
        "example.com": true,
        "example.com.au": false
    }
}
```

#### POST /maintenance 
Will enable / disable maintenance mode for the requested sites and toggle the file name.

Example Request
```json
{
    "sites": {
        "example.com": true,
        "example.com.au": false
    }
}
```

Example Response
```json
{
    "sites": {
        "example.com": true,
        "example.com.au": false
    }
}
```

### IP Whitelist API
This API will add / update valid IPv4 or IPv6 addresses to the JSON files, so that the mesh can use these IPs to determine whether to allow specific requests through maintenance mode.

#### GET /maintenance/whitelist/
Returns the currently allowed IP addresses

Example Response
```json
{
    "whitelist": [
        "127.0.0.1",
        "192.168.0.1",
        "8.8.8.8",
        "0.0.0.0",
        "2001:0db8::1",
        "2001:4860:4860::8888",
    ]
}
```

#### POST /maintenance/whitelist/
Update allowed IP addresses to only what is included in the payload.

Example Request
```json
{
    "whitelist": [
        "127.0.0.1"
    ]
}
```

Example Response 
```json
{
    "whitelist": [
        "127.0.0.1"
    ]
}
```

#### PATCH /maintenance/whitelist/
Add the provided IP addresses to the allowlist.

Example Request
```json
{
    "whitelist": [
        "192.168.1.1"
    ]
}
```

Example Response
```json
{
    "whitelist": [
        "127.0.0.1",
        "192.168.0.1",
        "8.8.8.8",
        "0.0.0.0",
        "2001:0db8::1",
        "2001:4860:4860::8888",
        "192.168.1.1"
    ]
}
```