import {
  CodePipelineClient,
  PutJobSuccessResultCommand,
  PutJobFailureResultCommand,
} from "@aws-sdk/client-codepipeline";
import {
  RegisterTaskDefinitionCommand,
  RegisterTaskDefinitionCommandInput,
  ECSClient,
  CreateServiceCommandInput,
  CreateServiceCommand,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  CreateRuleCommand,
  CreateRuleCommandInput,
  CreateTargetGroupCommand,
  CreateTargetGroupCommandInput,
  ElasticLoadBalancingV2,
  RegisterTargetsCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { CodePipelineEvent } from "aws-lambda";

// TODO: create new task definition from this

const cluster = process.env.cluster!;
const subnet_1 = process.env.subnet_1!;
const subnet_2 = process.env.subnet_2!;
const security_group = process.env.security_group!;
const listener = process.env.load_balancer!;

const codepipelineClient = new CodePipelineClient();
const ecsClient = new ECSClient();
const elbClient = new ElasticLoadBalancingV2();

export const handler = async (
  event: CodePipelineEvent,
  context: any
): Promise<void> => {
  const jobId = event["CodePipeline.job"].id;
  console.log(`Job id: ${jobId}`);
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));

  // Notify CodePipeline of a successful job
  const putJobSuccess = async function (message: string | undefined) {
    const command = new PutJobSuccessResultCommand({
      jobId: jobId,
      outputVariables: {
        taskDef: "Example task def",
      },
    });
    try {
      console.log(`Succeeded with message: ${message}`);
      await codepipelineClient.send(command);
      context.succeed(message);
    } catch (err) {
      context.fail(err);
    }
  };

  // Notify CodePipeline of a failed job
  const putJobFailure = async function (message: string | undefined) {
    console.log(`Failed with message: ${message}`);
    const command = new PutJobFailureResultCommand({
      jobId: jobId,
      failureDetails: {
        message: JSON.stringify(message),
        type: "JobFailed",
        externalExecutionId: context.awsRequestId,
      },
    });
    await codepipelineClient.send(command);
    context.fail(message);
  };

  // TODO: get the ticket number from the PR
  const ticketNumber = jobId;

  return createTaskDef(ticketNumber)
    .then(taskDef => createService(ticketNumber, taskDef))
    .then(tasks => registerTargetGroup(ticketNumber, tasks))
    .then(targetGroup => updateLoadBalancer(ticketNumber, targetGroup))
    .then(putJobSuccess)
    .catch(putJobFailure);
};

const createTaskDef = async (ticket: string): Promise<string | undefined> => {
  // TODO: this entire task definition should be constructed dynamically rather than being hardcoded
  const input: RegisterTaskDefinitionCommandInput = {
    containerDefinitions: [
      {
        name: ticket,
        // TODO: get this dynamically
        image: "",
        cpu: 0,
        links: [],
        portMappings: [
          {
            containerPort: 4000,
            hostPort: 4000,
            protocol: "tcp",
          },
        ],
        essential: true,
        // TODO: get this dynamically
        environment: [
          {
            name: "MAINTENANCE_FILE_PATH",
            value: "/mnt/efs0/maintenance.enabled",
          },
          {
            name: "REDIS_DATABASE",
            value: "0",
          },
          {
            name: "REDIS_PORT",
            value: "6379",
          },
          {
            name: "REDIS_ENDPOINT",
            value: "",
          },
        ],
        // TODO: get this dynamically
        secrets: [],
        logConfiguration: {
          logDriver: "awslogs",
          // TODO: get this dynamically
          options: {},
        },
        healthCheck: {
          command: [
            "CMD-SHELL",
            "curl -f http://localhost || echo 'Health check failed'",
          ],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 5,
        },
      },
      {
        name: "nginx",
        image: "",
        cpu: 0,
        portMappings: [
          {
            containerPort: 80,
            hostPort: 80,
            protocol: "tcp",
          },
        ],
        essential: true,
        logConfiguration: {
          logDriver: "awslogs",
          // TODO: get this dynamically
          options: {},
        },
        healthCheck: {
          command: [
            "CMD-SHELL",
            "curl -f http://localhost || echo 'Health check failed'",
          ],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 5,
        },
      },
      {
        name: "xray",
        image: "amazon/aws-xray-daemon",
        cpu: 32,
        memoryReservation: 256,
        links: [],
        portMappings: [
          {
            containerPort: 4000,
            hostPort: 4000,
            protocol: "udp",
          },
        ],
        essential: false,
        healthCheck: {
          command: ["CMD-SHELL", "pgrep xray || echo 'Health check failed'"],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 5,
        },
      },
    ],
    // TODO: get this dynamically
    family: "",
    taskRoleArn: "",
    executionRoleArn: "",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "2048",
    memory: "4096",
  };

  const command = new RegisterTaskDefinitionCommand(input);
  const commandOutput = await ecsClient.send(command);

  return commandOutput.taskDefinition?.taskDefinitionArn || undefined;
};

const createService = async (
  serviceName: string,
  taskDefArn?: string
): Promise<string[]> => {
  if (!taskDefArn) throw new Error("No Task Definition Arn Provided");

  console.log(`Cluster: ${cluster}`);

  const input: CreateServiceCommandInput = {
    serviceName: `temporary-env-${serviceName}`,
    cluster: cluster,
    taskDefinition: taskDefArn,
    desiredCount: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: [subnet_1, subnet_2],
        securityGroups: [security_group],
        assignPublicIp: "DISABLED",
      },
    },
    launchType: "FARGATE",
  };

  const command = new CreateServiceCommand(input);

  const response = await ecsClient.send(command);
  // Step 2: List the tasks for the created service
  const listTasksParams = {
    cluster: cluster, // Same cluster where the service is running
    serviceName: response.service?.serviceName,
  };

  const listTasksCommand = new ListTasksCommand(listTasksParams);
  const listTasksResponse = await ecsClient.send(listTasksCommand);
  return listTasksResponse.taskArns || []; // Get the task ARNs
};

const registerTargetGroup = async (
  ticket: string,
  tasks: string[]
): Promise<string> => {
  const createInput: CreateTargetGroupCommandInput = {
    Name: ticket, // Name for your target group
    Protocol: "HTTP", // Protocol for routing traffic (HTTP, HTTPS, TCP, etc.)
    Port: 4000, // Port to route traffic to the targets
    VpcId: "", // TODO
    HealthCheckProtocol: "HTTP", // Protocol used to perform health checks
    HealthCheckPath: "/", // Path for health checks (e.g., "/health")
    TargetType: "instance", // Can be "instance", "ip", or "lambda"
  };

  const createCommand = new CreateTargetGroupCommand(createInput);
  const createResponse = await elbClient.send(createCommand);

  const targetGroupArn = createResponse.TargetGroups?.at(0)?.TargetGroupArn;

  if (!targetGroupArn) throw new Error("Target group arn could not be found");

  const registerInput = {
    TargetGroupArn: targetGroupArn, // ARN of the target group you want to register the target to
    Targets: tasks.map(task => {
      return { Id: task, Port: 4000 };
    }),
  };

  const registerCommand = new RegisterTargetsCommand(registerInput);
  await elbClient.send(registerCommand);

  return targetGroupArn;
};

const updateLoadBalancer = async (
  ticket: string,
  targetGroupArn: string
): Promise<string> => {
  // TODO: register target group

  // TODO: assign target group to listener
  const input: CreateRuleCommandInput = {
    ListenerArn: listener,
    Conditions: [
      {
        Field: "host-header",
        Values: [`${ticket}.*`],
      },
    ],
    Actions: [
      {
        Type: "forward",
        TargetGroupArn: targetGroupArn,
      },
    ],
    Priority: 10,
  };

  const command = new CreateRuleCommand(input);
  await elbClient.send(command);

  return `Updated listener ${listener} to include new route for ${ticket}`;
};
