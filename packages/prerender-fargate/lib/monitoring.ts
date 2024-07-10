import { Construct } from "constructs";
import {
  Metric,
  TextWidget,
  SingleValueWidget,
  GraphWidget,
  LegendPosition,
  Dashboard,
  Column,
  LogQueryWidget,
  Alarm,
  ComparisonOperator,
  LogQueryVisualizationType,
  MathExpression,
} from "aws-cdk-lib/aws-cloudwatch";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancer,
  HttpCodeElb,
  HttpCodeTarget,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export interface PerformanceMetricsProps {
  dashboardName?: string;
  service: FargateService;
  loadBalancer: ApplicationLoadBalancer;
  logGroup: LogGroup;
  snsTopic?: Topic;
  cacheBucket: Bucket;
  recache?: {
    queue: Queue;
    consumer: lambda.Function;
    producer: lambda.Function;
  };
  additionalAlarms?: Alarm[];
}

export class PerformanceMetrics extends Construct {
  constructor(scope: Construct, id: string, props: PerformanceMetricsProps) {
    super(scope, id);

    const alarms: Alarm[] = props.additionalAlarms || [];

    // Load balancer metrics and widgets
    const requestCountMetrics: Metric[] = [
      props.loadBalancer.metrics.requestCount({
        label: "Total Request Count",
      }),
      props.loadBalancer.metrics.httpCodeTarget(
        HttpCodeTarget.TARGET_2XX_COUNT,
        {
          label: "HTTP 2xx Count",
          color: "#69ae34",
        }
      ),
      props.loadBalancer.metrics.httpCodeElb(HttpCodeElb.ELB_4XX_COUNT, {
        label: "ELB 4xx Count",
        color: "#f89256",
      }),
      props.loadBalancer.metrics.httpCodeElb(HttpCodeElb.ELB_5XX_COUNT, {
        label: "ELB 5xx Count",
      }),
    ];

    const targetResponseTime: Metric =
      props.loadBalancer.metrics.targetResponseTime({
        label: "Target Response Time",
      });

    const loadBalancerLabel = new TextWidget({
      markdown: "# Load Balancer",
      width: 12,
      height: 1,
    });

    const requestCountSingleWidget = new SingleValueWidget({
      title: "Prerender Request Count",
      width: 12,
      height: 4,
      sparkline: true,
      metrics: requestCountMetrics,
    });

    const requestCountGraphWidget = new GraphWidget({
      title: "Prerender Request Count",
      width: 12,
      height: 7,
    });

    const responseTimeGraphWidget = new GraphWidget({
      title: "Target Response Time",
      width: 12,
      height: 6,
      legendPosition: LegendPosition.HIDDEN,
    });
    responseTimeGraphWidget.addLeftMetric(targetResponseTime);

    requestCountMetrics.forEach(metric => {
      requestCountGraphWidget.addLeftMetric(metric);
    });

    const loadBalancerWidgets = [
      loadBalancerLabel,
      requestCountSingleWidget,
      requestCountGraphWidget,
      responseTimeGraphWidget,
    ];

    // Prerender Performance
    const currentActiveTasksMetric: Metric[] = [
      // Current no built in method to get these metrics
      // Need to manually construct
      new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "DesiredTaskCount",
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        statistic: "avg",
      }),
      new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        color: "#69ae34",
        statistic: "avg",
      }),
      new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "PendingTaskCount",
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        color: "#f89256",
        statistic: "avg",
      }),
    ];

    // Alert when 0 tasks are running
    alarms.push(
      new Alarm(this, "currentActiveTasksAlarm", {
        metric: currentActiveTasksMetric[0],
        threshold: 0,
        comparisonOperator: ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
      })
    );

    const taskCPUMetrics: Metric[] = [
      props.service.metricCpuUtilization({
        statistic: "min",
      }),
      props.service.metricCpuUtilization({
        statistic: "max",
      }),
      props.service.metricCpuUtilization({
        statistic: "avg",
      }),
    ];

    const taskMemoryMetrics: Metric[] = [
      props.service.metricMemoryUtilization({
        statistic: "min",
      }),
      props.service.metricMemoryUtilization({
        statistic: "max",
      }),
      props.service.metricMemoryUtilization({
        statistic: "avg",
      }),
    ];

    /**
     * PERFORMANCE STATS BLOCK
     */
    const prerenderPerformanceLabel = new TextWidget({
      markdown: "# Prerender Performance",
      width: 24,
      height: 1,
    });

    const currentActiveTasksSingleWidget = new SingleValueWidget({
      title: "Current Active Tasks",
      width: 9,
      height: 3,
      sparkline: false,
      metrics: currentActiveTasksMetric,
    });

    const currentActiveTasksGraphWidget = new GraphWidget({
      title: "Current Active Tasks",
      width: 9,
      height: 5,
    });
    currentActiveTasksMetric.slice(1).forEach(metric => {
      currentActiveTasksGraphWidget.addLeftMetric(metric);
    });

    const currentTaskWidgets = [
      currentActiveTasksSingleWidget,
      currentActiveTasksGraphWidget,
    ];

    const taskCPUGraphWidget = new GraphWidget({
      title: "Prerender CPU",
      width: 9,
      height: 6,
    });
    taskCPUMetrics.forEach(metric => {
      taskCPUGraphWidget.addLeftMetric(metric);
    });

    const taskMemoryGraphWidget = new GraphWidget({
      title: "Prerender Memory",
      width: 9,
      height: 6,
    });
    taskMemoryMetrics.forEach(metric => {
      taskMemoryGraphWidget.addLeftMetric(metric);
    });

    const prerenderPerformanceMetrics = [
      taskCPUGraphWidget,
      taskMemoryGraphWidget,
    ];

    const statusCodes = new LogQueryWidget({
      title: "Response Codes",
      width: 6,
      height: 6,
      queryString:
        "fields status | filter level like 'render' and status not like '401' | stats count(status) as `Count` by `status` | sort `Count` desc",
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.PIE,
    });

    // Top bot refers
    const topBotRefers = new LogQueryWidget({
      title: "Top Bot Refers",
      width: 9,
      height: 8,
      queryString:
        "fields `origin.x-prerender-user-agent` as userAgent | filter level like 'render' and status not like '401' | stats count(userAgent) as countUserAgent by userAgent | sort countUserAgent desc",
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.TABLE,
    });

    // Top pages
    const topPages = new LogQueryWidget({
      title: "Top Pages",
      width: 6,
      height: 14,
      queryString:
        "fields path | filter level like 'render' and status not like '401' | stats count(path) as pathUrl by path | sort pathUrl desc",
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.TABLE,
    });

    // Average render time
    const avgRenderTimePerHour = new LogQueryWidget({
      title: "Average Render Time (per hour)",
      width: 9,
      height: 6,
      queryString: `fields time | filter level like 'render' and status not like '401' | stats avg(time) by bin(1h)`,
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.LINE,
    });

    const avgRenderTimePerDay = new LogQueryWidget({
      title: "Average Render Time (per day)",
      width: 9,
      height: 6,
      queryString: `fields time | filter level like 'render' and status not like '401' | stats avg(time) by bin(1d)`,
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.LINE,
    });

    const prerenderPerformanceLogBased = [
      new Column(avgRenderTimePerHour, avgRenderTimePerDay, topBotRefers),
      new Column(statusCodes, topPages),
    ];

    /**
     * CACHE STATS BLOCK
     */
    const cacheLabel = new TextWidget({
      markdown: "# Prerender Cache",
      width: 24,
      height: 1,
    });

    // Cache hits
    const cacheHitRate = new LogQueryWidget({
      title: "Cache Hit Rate",
      width: 10,
      height: 11,
      queryString:
        "fields @timestamp, message | parse message /(?<cacheHitTemp>.*?:)/ | filter message like 'cached object' | fields replace(cacheHitTemp, 'Found cached object:', 'HIT') as cacheHit1 | fields replace(cacheHit1, 'Fetching cached object from S3 bucket failed with error:', 'MISS') as cacheHit | stats count(cacheHit) as `Cache Hit Rate` by cacheHit",
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.PIE,
    });

    const cacheBucketStorageSize = new Metric({
      namespace: "AWS/S3",
      metricName: "BucketSizeBytes",
      dimensionsMap: {
        BucketName: props.cacheBucket.bucketName,
        StorageType: "ReducedRedundancyStorage",
      },
      color: "#08aad2",
      statistic: "avg",
    });

    const cacheBucketNumberOfObjects = new Metric({
      namespace: "AWS/S3",
      metricName: "NumberOfObjects",
      dimensionsMap: {
        BucketName: props.cacheBucket.bucketName,
        StorageType: "AllStorageTypes",
      },
      color: "#69ae34",
      statistic: "avg",
    });

    const cacheBucketWidgetProps = {
      width: 14,
      height: 3,
      start: "-P30D",
    };
    const cacheBucketTextWidget = new SingleValueWidget({
      ...cacheBucketWidgetProps,
      title: "Cached Objects",
      metrics: [cacheBucketNumberOfObjects, cacheBucketStorageSize],
    });

    const cacheBucketWidget = new GraphWidget({
      ...cacheBucketWidgetProps,
      title: "Cached Objects (Last 30 Days)",
      height: 8,
    });
    cacheBucketWidget.addLeftMetric(cacheBucketNumberOfObjects);
    cacheBucketWidget.addRightMetric(cacheBucketStorageSize);

    const cachedBucketWidgets = [cacheBucketTextWidget, cacheBucketWidget];

    /**
     * Render History
     */
    const renderHistoryLabel = new TextWidget({
      markdown: "# Render History",
      width: 12,
      height: 1,
    });

    const renderHistoryWidget = new LogQueryWidget({
      title: "Render History",
      width: 12,
      height: 17,
      queryString:
        "fields @timestamp, status, time, path | filter level like 'render' and status not like '401'",
      logGroupNames: [props.logGroup.logGroupName],
      view: LogQueryVisualizationType.TABLE,
    });

    const renderHistory = [renderHistoryLabel, renderHistoryWidget];

    /**
     * RECACHE STATS BLOCK
     */
    const recacheWidgets = [];
    if (props.recache) {
      const recacheLabel = new TextWidget({
        markdown: "# Prerender Re-cache",
        width: 24,
        height: 1,
      });
      recacheWidgets.push(recacheLabel);

      // Items in sqs queue
      const visibleMessages = new Metric({
        namespace: "AWS/SQS",
        metricName: "ApproximateNumberOfMessagesVisible",
        dimensionsMap: {
          QueueName: props.recache.queue.queueName,
        },
        color: "#08aad2",
        statistic: "avg",
      });

      const messagesWidget = new GraphWidget({
        title: "Message Queue Count",
        width: 12,
        height: 8,
      });
      messagesWidget.addLeftMetric(visibleMessages);

      recacheWidgets.push(messagesWidget);

      // Oldest age of item in queue
      const oldestMessage = new Metric({
        namespace: "AWS/SQS",
        metricName: "ApproximateAgeOfOldestMessage",
        dimensionsMap: {
          QueueName: props.recache.queue.queueName,
        },
        color: "#08aad2",
        statistic: "max",
      });

      const oldestMessageWidget = new GraphWidget({
        title: "Oldest Message in Queue",
        width: 12,
        height: 8,
      });
      oldestMessageWidget.addLeftMetric(oldestMessage);

      recacheWidgets.push(oldestMessageWidget);

      // Producer executions
      const producerExecutionFailures = new Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensionsMap: {
          FunctionName: props.recache.producer.functionName,
        },
        color: "#d13212",
        statistic: "sum",
      });
      const producerInvocations = new Metric({
        namespace: "AWS/Lambda",
        metricName: "Invocations",
        dimensionsMap: {
          FunctionName: props.recache.producer.functionName,
        },
        statistic: "sum",
      });
      const producerExecutionSuccesses = new MathExpression({
        expression:
          "100 - 100 * producerErrors / MAX([producerErrors, producerInvocations])",
        usingMetrics: {
          producerErrors: producerExecutionFailures,
          producerInvocations: producerInvocations,
        },
        label: "Success rate",
        color: "#69ae34",
      });

      const producerWidget = new GraphWidget({
        title: "Producer - Error count and success rate",
        width: 12,
        height: 8,
        rightYAxis: {
          max: 100,
        },
      });
      producerWidget.addLeftMetric(producerExecutionFailures);
      producerWidget.addLeftMetric(producerExecutionSuccesses);

      recacheWidgets.push(producerWidget);

      // Consumer executions
      const consumerExecutionFailures = new Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensionsMap: {
          FunctionName: props.recache.consumer.functionName,
        },
        color: "#d13212",
        statistic: "sum",
      });
      const consumerInvocations = new Metric({
        namespace: "AWS/Lambda",
        metricName: "Invocations",
        dimensionsMap: {
          FunctionName: props.recache.consumer.functionName,
        },
        statistic: "sum",
      });
      const consumerExecutionSuccesses = new MathExpression({
        expression:
          "100 - 100 * consumerErrors / MAX([consumerErrors, consumerInvocations])",
        usingMetrics: {
          consumerErrors: consumerExecutionFailures,
          consumerInvocations: consumerInvocations,
        },
        label: "Success rate",
        color: "#69ae34",
      });

      const consumerWidget = new GraphWidget({
        title: "Consumer - Error count and success rate",
        width: 12,
        height: 8,
        rightYAxis: {
          max: 100,
        },
      });
      consumerWidget.addLeftMetric(consumerExecutionFailures);
      consumerWidget.addLeftMetric(consumerExecutionSuccesses);

      recacheWidgets.push(consumerWidget);
    }

    // Create the dashboard
    new Dashboard(this, "dashboard", {
      dashboardName: props.dashboardName,
      widgets: [
        [prerenderPerformanceLabel],
        [
          new Column(...currentTaskWidgets, ...prerenderPerformanceMetrics),
          ...prerenderPerformanceLogBased,
        ],
        [cacheLabel],
        [new Column(...cachedBucketWidgets), new Column(cacheHitRate)],
        [...recacheWidgets],
        [new Column(...loadBalancerWidgets), new Column(...renderHistory)],
      ],
    });

    // TODO: add more default alerts
    // Notify SNS topic on all alarm triggers (if SNS topic is provided)
    if (props.snsTopic) {
      alarms.forEach(alarm => alarm.addAlarmAction);
    }
  }
}
