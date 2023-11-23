import { Construct } from "constructs";
import {
  Metric,
  TextWidget,
  SingleValueWidget,
  GraphWidget,
  LegendPosition,
  Dashboard as CWDashboard,
  Column,
  LogQueryWidget,
} from "aws-cdk-lib/aws-cloudwatch";
import { FargateService } from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancer,
  HttpCodeElb,
  HttpCodeTarget,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { WebApplicationFirewall } from "./web-application-firewall";
import { LogGroup } from "aws-cdk-lib/aws-logs";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DashboardProps {
  service: FargateService;
  loadBalancer: ApplicationLoadBalancer;
  firewall: WebApplicationFirewall;
  logGroup: LogGroup;
}

export class Dashboard extends Construct {
  constructor(scope: Construct, id: string, props: DashboardProps) {
    super(scope, id);

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
      title: "Mesh Request Count",
      width: 12,
      height: 4,
      sparkline: true,
      metrics: requestCountMetrics,
    });

    const requestCountGraphWidget = new GraphWidget({
      title: "Mesh Request Count",
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

    // WAF metrics and widgets
    const wafRequestMetrics: Metric[] = [
      new Metric({
        namespace: "AWS/WAFV2",
        metricName: "AllowedRequests",
        dimensionsMap: {
          WebACL:
            props.firewall.acl.name ||
            "MeshHostingmeshwafWebAclD163A31D-b4zo3YLl9rkw", // TODO: get the name automatically
          Rule: "ALL",
          Region: "ap-southeast-2", // TODO: get the region automatically
        },
      }),
    ];

    const wafLabel = new TextWidget({
      markdown: "# WAF",
      width: 12,
      height: 1,
    });

    const wafRequestsSingleWidget = new SingleValueWidget({
      title: "WAF Request Count",
      width: 12,
      height: 4,
      sparkline: true,
      metrics: wafRequestMetrics,
    });

    const wafRequestsGraphWidget = new GraphWidget({
      title: "WAF Request Count",
      width: 12,
      height: 7,
    });
    wafRequestMetrics.forEach(metric => {
      wafRequestsGraphWidget.addLeftMetric(metric);
    });

    const wafWidgets = [
      wafLabel,
      wafRequestsSingleWidget,
      wafRequestsGraphWidget,
    ];

    // Mesh Performance
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
        statistic: "min",
      }),
      new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        color: "#69ae34",
        statistic: "min",
      }),
      new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "PendingTaskCount",
        dimensionsMap: {
          ServiceName: props.service.serviceName,
          ClusterName: props.service.cluster.clusterName,
        },
        color: "#f89256",
        statistic: "min",
      }),
    ];

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

    const meshPerformanceLabel = new TextWidget({
      markdown: "# Mesh Performance",
      width: 24,
      height: 1,
    });

    const currentActiveTasksSingleWidget = new SingleValueWidget({
      title: "Current Active Tasks",
      width: 7,
      height: 3,
      sparkline: false,
      metrics: currentActiveTasksMetric,
    });

    const currentActiveTasksGraphWidget = new GraphWidget({
      title: "Current Active Tasks",
      width: 7,
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
      title: "Mesh CPU",
      width: 7,
      height: 6,
    });
    taskCPUMetrics.forEach(metric => {
      taskCPUGraphWidget.addLeftMetric(metric);
    });

    const taskMemoryGraphWidget = new GraphWidget({
      title: "Mesh Memory",
      width: 7,
      height: 6,
    });
    taskMemoryMetrics.forEach(metric => {
      taskMemoryGraphWidget.addLeftMetric(metric);
    });

    const meshPerformanceMetrics = [taskCPUGraphWidget, taskMemoryGraphWidget];

    const taskLogsWidget = new LogQueryWidget({
      title: "Application Logs",
      width: 10,
      height: 12,
      queryString:
        "fields @timestamp, @message\n| sort @timestamp desc\n| limit 25",
      logGroupNames: [
        props.logGroup.logGroupName,
      ],
    });

    // Create the dashboard
    new CWDashboard(this, "dashboard", {
      dashboardName: "Mesh-Dashboard",
      widgets: [
        [new Column(...loadBalancerWidgets), new Column(...wafWidgets)],
        [meshPerformanceLabel],
        [
          new Column(...currentTaskWidgets),
          new Column(...meshPerformanceMetrics),
          new Column(taskLogsWidget)
        ],
      ],
    });
  }
}
