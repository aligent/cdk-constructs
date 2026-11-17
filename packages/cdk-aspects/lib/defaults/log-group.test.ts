import { App, Aspects, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CfnLogGroup, LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { LogGroupDefaultsAspect } from "./log-group";

type Duration = "SHORT" | "MEDIUM" | "LONG";

const PROFILES: Array<{
  duration: Duration;
  retention: RetentionDays;
  deletionPolicy: "Delete" | "Retain";
}> = [
  {
    duration: "SHORT",
    retention: RetentionDays.ONE_WEEK,
    deletionPolicy: "Delete",
  },
  {
    duration: "MEDIUM",
    retention: RetentionDays.SIX_MONTHS,
    deletionPolicy: "Delete",
  },
  {
    duration: "LONG",
    retention: RetentionDays.TWO_YEARS,
    deletionPolicy: "Retain",
  },
];

describe("LogGroupDefaultsAspect", () => {
  let app: App;
  let stack: Stack;

  const setup = (duration: Duration) => {
    app = new App();
    stack = new Stack(app, "TestStack");
    Aspects.of(stack).add(new LogGroupDefaultsAspect({ duration }));
  };

  /**
   * Each test creates a single log group, so the first match is the one under test.
   */
  const synthLogGroup = () => {
    app.synth();
    return Object.values(
      Template.fromStack(stack).findResources("AWS::Logs::LogGroup")
    )[0];
  };

  describe.each(PROFILES)(
    "$duration duration",
    ({ duration, retention, deletionPolicy }) => {
      beforeEach(() => setup(duration));

      it("applies profile retention to an L2 LogGroup with no explicit retention", () => {
        new LogGroup(stack, "MyLogGroup");

        const resource = synthLogGroup();
        expect(resource.Properties.RetentionInDays).toBe(retention);
      });

      it(`applies ${deletionPolicy} removal policy`, () => {
        new LogGroup(stack, "MyLogGroup");

        const resource = synthLogGroup();
        expect(resource.DeletionPolicy).toBe(deletionPolicy);
        expect(resource.UpdateReplacePolicy).toBe(deletionPolicy);
      });

      it("respects an explicit non-default retention", () => {
        new LogGroup(stack, "MyLogGroup", {
          retention: RetentionDays.ONE_MONTH,
        });

        const resource = synthLogGroup();
        expect(resource.Properties.RetentionInDays).toBe(
          RetentionDays.ONE_MONTH
        );
      });

      it("respects an explicit INFINITE retention", () => {
        new LogGroup(stack, "MyLogGroup", {
          retention: RetentionDays.INFINITE,
        });

        const resource = synthLogGroup();
        expect(resource.Properties?.RetentionInDays).toBeUndefined();
      });
    }
  );

  it("overrides an explicit TWO_YEARS retention, since it is indistinguishable from the CDK default", () => {
    setup("SHORT");
    new LogGroup(stack, "MyLogGroup", { retention: RetentionDays.TWO_YEARS });

    const resource = synthLogGroup();
    expect(resource.Properties.RetentionInDays).toBe(RetentionDays.ONE_WEEK);
  });

  it("does not modify L1 CfnLogGroups", () => {
    setup("SHORT");
    new CfnLogGroup(stack, "RawLogGroup");

    const resource = synthLogGroup();
    expect(resource.Properties?.RetentionInDays).toBeUndefined();
    expect(resource.DeletionPolicy).toBeUndefined();
  });
});
