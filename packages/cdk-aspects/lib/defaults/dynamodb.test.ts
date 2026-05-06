import { App, Aspects, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {
  AttributeType,
  BillingMode,
  CfnTable,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { DynamoDbDefaultsAspect } from "./dynamodb";

const makeTable = (
  stack: Stack,
  id: string,
  billingMode?: BillingMode
): Table =>
  new Table(stack, id, {
    partitionKey: { name: "pk", type: AttributeType.STRING },
    ...(billingMode !== undefined && { billingMode }),
  });

describe("DynamoDbDefaultsAspect", () => {
  let app: App;
  let stack: Stack;

  const setup = (duration: "SHORT" | "MEDIUM" | "LONG") => {
    app = new App();
    stack = new Stack(app, "TestStack");
    Aspects.of(stack).add(new DynamoDbDefaultsAspect({ duration }));
  };

  describe("SHORT duration", () => {
    beforeEach(() => setup("SHORT"));

    it("sets PROVISIONED billing mode on tables with no explicit billing mode", () => {
      makeTable(stack, "MyTable");
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PROVISIONED",
      });
    });

    it("does not inject ProvisionedThroughput onto a PAY_PER_REQUEST table", () => {
      makeTable(stack, "OnDemandTable", BillingMode.PAY_PER_REQUEST);
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      const props = Object.values(resources)[0].Properties;
      expect(props["ProvisionedThroughput"]).toBeUndefined();
    });

    it("preserves PAY_PER_REQUEST billing mode on an explicit on-demand table", () => {
      makeTable(stack, "OnDemandTable", BillingMode.PAY_PER_REQUEST);
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    it("does not override an existing ProvisionedThroughput", () => {
      const table = makeTable(stack, "MyTable");
      const cfnTable = table.node.defaultChild as CfnTable;
      cfnTable.provisionedThroughput = {
        readCapacityUnits: 10,
        writeCapacityUnits: 10,
      };
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 10,
        },
      });
    });

    it("applies DESTROY removal policy", () => {
      makeTable(stack, "MyTable");
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      expect(Object.values(resources)[0].DeletionPolicy).toBe("Delete");
    });
  });

  describe("MEDIUM duration", () => {
    beforeEach(() => setup("MEDIUM"));

    it("sets PAY_PER_REQUEST billing mode on tables with no explicit billing mode", () => {
      makeTable(stack, "MyTable");
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    it("sets on-demand throughput limits on tables with no explicit billing mode", () => {
      makeTable(stack, "MyTable");
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        OnDemandThroughput: {
          MaxReadRequestUnits: 100,
          MaxWriteRequestUnits: 100,
        },
      });
    });

    it("does not inject OnDemandThroughput when billing mode is forced to PROVISIONED at L1", () => {
      // CDK L2 omits billingMode for PROVISIONED (it's the CF default), so we force it at L1
      // to simulate a table where someone has explicitly pinned PROVISIONED via cfnTable override
      const table = makeTable(stack, "ProvisionedTable");
      const cfnTable = table.node.defaultChild as CfnTable;
      cfnTable.billingMode = "PROVISIONED";
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      const props = Object.values(resources)[0].Properties;
      expect(props["OnDemandThroughput"]).toBeUndefined();
    });

    it("does not override an existing OnDemandThroughput", () => {
      const table = makeTable(stack, "MyTable");
      const cfnTable = table.node.defaultChild as CfnTable;
      cfnTable.onDemandThroughput = {
        maxReadRequestUnits: 50,
        maxWriteRequestUnits: 50,
      };
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        OnDemandThroughput: {
          MaxReadRequestUnits: 50,
          MaxWriteRequestUnits: 50,
        },
      });
    });

    it("applies DESTROY removal policy", () => {
      makeTable(stack, "MyTable");
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      expect(Object.values(resources)[0].DeletionPolicy).toBe("Delete");
    });
  });

  describe("LONG duration", () => {
    beforeEach(() => setup("LONG"));

    it("sets PAY_PER_REQUEST billing mode", () => {
      makeTable(stack, "MyTable");
      app.synth();

      Template.fromStack(stack).hasResourceProperties("AWS::DynamoDB::Table", {
        BillingMode: "PAY_PER_REQUEST",
      });
    });

    it("does not set on-demand throughput limits (no cap for LONG)", () => {
      makeTable(stack, "MyTable");
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      const props = Object.values(resources)[0].Properties;
      expect(props["OnDemandThroughput"]).toBeUndefined();
    });

    it("applies RETAIN removal policy", () => {
      makeTable(stack, "MyTable");
      app.synth();

      const resources = Template.fromStack(stack).findResources(
        "AWS::DynamoDB::Table"
      );
      expect(Object.values(resources)[0].DeletionPolicy).toBe("Retain");
    });
  });
});
