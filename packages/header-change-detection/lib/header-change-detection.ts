import { DockerImage, Duration } from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, RuleProps, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction, SnsTopic } from "aws-cdk-lib/aws-events-targets";
import { Architecture, Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";
import { Esbuild } from "@aligent/cdk-esbuild";

export interface HeaderChangeDetectionProps {
  /**
   * List of URLs to monitor for header changes
   */
  urls: string[];

  /**
   * Optional list of additional headers to monitor
   * 
   * @default []
   */
  additionalHeaders?: string[];

  /**
   * Optionally disable all the default headers
   * 
   * @default false
   */
  disableDefaults?: boolean;

  /**
   * SNS Topic to send change detection notifications to
   */
  snsTopic: SnsTopic

  /**
   * The schedule for performing the header check
   * 
   * @default Schedule.rate(Duration.hours(1))
   */
  schedule?: Schedule

  /**
   * Optionally pass any rule properties 
   */
  ruleProps?: Partial<RuleProps>
}

const command = [
  "sh",
  "-c",
  'echo "Docker build not supported. Please install esbuild."',
];

const defaultHeaders = [
  'content-security-policy',
  'content-security-policy-report-only',
  'reporting-endpoints',
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'referrer-policy',
  'permission-policy',
  'cache-control',
  'set-cookie',
]

export class HeaderChangeDetection extends Construct {

  constructor(scope: Construct, id: string, props: HeaderChangeDetectionProps) {
    super(scope, id);

    const headers = props.disableDefaults ? [] : defaultHeaders;

    headers.push(...props.additionalHeaders?.map(header => header.toLowerCase()) || []);

    const table = new Table(this, 'Table', {
      partitionKey: {
        name: 'Url',
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST
    })

    const schedule = new Rule(this, 'EventRule', {
      schedule: props.schedule || Schedule.rate(Duration.hours(1)),
      ...props.ruleProps
    });

    const lambda = new Function(this, 'HeaderCheck', {
      architecture: Architecture.X86_64,
      runtime: Runtime.NODEJS_20_X,
      handler: "header-check.handler",
      code: Code.fromAsset(join(__dirname, "lambda"), {
        bundling: {
          command,
          image: DockerImage.fromRegistry("busybox"),
          local: new Esbuild({
            entryPoints: [join(__dirname, "lambda/header-check.ts")],
          })
        }
      }),
      environment: {
        "URLS": props.urls.join(','),
        "HEADERS": headers.join(','),
        "TABLE": table.tableName,
        "TOPIC_ARN": props.snsTopic.topic.topicArn
      }
    });

    schedule.addTarget(new LambdaFunction(lambda));

    table.grantWriteData(lambda);
    table.grantReadData(lambda);
    props.snsTopic.topic.grantPublish(lambda);
  }
}
