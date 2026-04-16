import { Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Code, Runtime } from "aws-cdk-lib/aws-lambda";
import path from "path";

import { NodejsFunctionFromEntry } from "./nodejs-function-from-entry";

// Mock Code.fromAsset to avoid needing real dist directories on disk.
jest.mock("aws-cdk-lib/aws-lambda", () => {
  const actual = jest.requireActual("aws-cdk-lib/aws-lambda");
  return {
    ...actual,
    Code: {
      ...actual.Code,
      fromAsset: jest.fn((assetPath: string) =>
        actual.Code.fromInline(`// asset: ${assetPath}`)
      ),
    },
  };
});

// The test __dirname lives under packages/constructs/nodejs-function-from-entry/lib,
// so "constructs" is the parent-of-parent dir name we can use as rootParentDir.
const ROOT_PARENT_DIR = "constructs";

describe("NodejsFunctionFromEntry", () => {
  let stack: Stack;

  beforeEach(() => {
    stack = new Stack();
    (Code.fromAsset as jest.Mock).mockClear();
  });

  test("creates a Lambda function with default prefixes", () => {
    new NodejsFunctionFromEntry(stack, "Handler", {
      entry: "runtime/handlers/fetch-data.ts",
      baseDir: __dirname,
      runtime: Runtime.NODEJS_22_X,
      rootParentDir: ROOT_PARENT_DIR,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
    });

    // Verify Code.fromAsset was called with the resolved dist path
    expect(Code.fromAsset).toHaveBeenCalledWith(
      path.resolve(__dirname, "../dist/fetch-data")
    );
  });

  test("creates a Lambda function with custom sourcePrefix and distPrefix", () => {
    new NodejsFunctionFromEntry(stack, "Custom", {
      entry: "src/handlers/process.ts",
      baseDir: __dirname,
      sourcePrefix: "src/handlers/",
      distPrefix: "../build/",
      runtime: Runtime.NODEJS_22_X,
      rootParentDir: ROOT_PARENT_DIR,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Handler: "index.handler",
    });

    expect(Code.fromAsset).toHaveBeenCalledWith(
      path.resolve(__dirname, "../build/process")
    );
  });

  test("throws when resolved path is outside the allowed root", () => {
    expect(() => {
      new NodejsFunctionFromEntry(stack, "BadPath", {
        entry: "runtime/handlers/../../../../../../etc/passwd.ts",
        baseDir: __dirname,
        runtime: Runtime.NODEJS_22_X,
        rootParentDir: ROOT_PARENT_DIR,
      });
    }).toThrow(/Path traversal detected/);
  });

  test("throws when no matching rootParentDir ancestor exists", () => {
    expect(() => {
      new NodejsFunctionFromEntry(stack, "NoRoot", {
        entry: "runtime/handlers/fetch-data.ts",
        baseDir: __dirname,
        runtime: Runtime.NODEJS_22_X,
        rootParentDir: "nonexistent-parent",
      });
    }).toThrow(/Could not find a 'nonexistent-parent\/<name>' ancestor/);
  });

  test("uses custom rootParentDir for path validation", () => {
    // "packages" is also a valid ancestor for the test directory
    expect(() => {
      new NodejsFunctionFromEntry(stack, "PackagesRoot", {
        entry: "runtime/handlers/fetch-data.ts",
        baseDir: __dirname,
        runtime: Runtime.NODEJS_22_X,
        rootParentDir: "packages",
      });
    }).not.toThrow();
  });
});
