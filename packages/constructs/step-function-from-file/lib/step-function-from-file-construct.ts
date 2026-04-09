import type { Function } from "aws-cdk-lib/aws-lambda";
import {
  DefinitionBody,
  StateMachine,
  type StateMachineProps,
} from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import path from "path";

export interface StepFunctionFromFileProps<
  TPrefix extends string = "infra/",
> extends StateMachineProps {
  readonly filepath: `${TPrefix}${string}`;
  readonly lambdaFunctions?: Function[];
  /**
   * Base directory to resolve `filepath` from.
   * Typically set to `import.meta.dirname` (or `__dirname`) of the calling module
   * so that `filepath` is resolved relative to the caller's location.
   */
  readonly baseDir: string;
}

/**
 * Step Function construct that loads its definition from a file
 *
 * Extends the standard StateMachine construct to load the state machine definition
 * from an external YAML or JSON file.
 *
 * Supports automatic Lambda function integration
 * through definition substitutions and IAM permission grants.
 *
 * Features:
 * - Loads definition from external files (YAML or JSON)
 * - Automatic Lambda function ARN substitution using `${functionId}` placeholders
 * - Automatic IAM permission grants for Lambda function invocation
 *
 * @example
 * ```typescript
 * // Basic usage (filepath must start with 'infra/' by default)
 * new StepFunctionFromFile(this, 'MyWorkflow', {
 *   filepath: 'infra/state-machines/workflow.asl.yaml',
 *   baseDir: import.meta.dirname,
 * });
 *
 * // With custom prefix
 * new StepFunctionFromFile<'src/'>(this, 'MyWorkflow', {
 *   filepath: 'src/step-functions/workflow.asl.yaml',
 *   baseDir: import.meta.dirname,
 * });
 *
 * // With Lambda function integration
 * new StepFunctionFromFile(this, 'WorkflowWithLambdas', {
 *   filepath: 'infra/state-machines/workflow.asl.yaml',
 *   baseDir: import.meta.dirname,
 *   lambdaFunctions: [processFunction, validateFunction],
 *   definitionSubstitutions: {
 *     BucketName: myBucket.bucketName,
 *   },
 * });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_stepfunctions.StateMachine.html
 */
export class StepFunctionFromFile<
  TPrefix extends string = "infra/",
> extends StateMachine {
  /**
   * Creates a new StepFunctionFromFile construct
   *
   * @param scope - The parent construct
   * @param id - The construct ID
   * @param props - Properties including file path and optional Lambda functions
   */
  constructor(
    scope: Construct,
    id: string,
    props: StepFunctionFromFileProps<TPrefix>
  ) {
    const definitionSubstitutionsObject =
      StepFunctionFromFile.prepareDefinitionSubstitutions(props);

    const {
      filepath,
      baseDir,
      ...newProps
    } = {
      ...props,
      ...definitionSubstitutionsObject,
    };

    const resolvedPath = StepFunctionFromFile.resolveAssetPath(
      filepath,
      baseDir
    );

    super(scope, id, {
      definitionBody: DefinitionBody.fromFile(resolvedPath),
      ...newProps,
    });

    if (props.lambdaFunctions) {
      props.lambdaFunctions.forEach(fn => fn.grantInvoke(this));
    }
  }

  /**
   * Merges Lambda function ARNs into definition substitutions,
   * enabling `${functionId}` placeholders in Step Function definitions.
   */
  private static prepareDefinitionSubstitutions<TPrefix extends string>(
    props: StepFunctionFromFileProps<TPrefix>
  ) {
    const { definitionSubstitutions, lambdaFunctions } = props;

    if (!lambdaFunctions?.length) {
      return {};
    }

    const lambdaDefinitions = Object.fromEntries(
      lambdaFunctions.map(fn => [fn.node.id, fn.functionArn])
    );

    return {
      definitionSubstitutions: {
        ...definitionSubstitutions,
        ...lambdaDefinitions,
      },
    };
  }

  /**
   * Resolves a path to assets relative to a given base directory.
   */
  private static resolveAssetPath(assetPath: string, baseDir: string): string {
    return path.resolve(baseDir, assetPath);
  }
}
