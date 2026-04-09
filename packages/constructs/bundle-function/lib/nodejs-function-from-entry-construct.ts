import {
  NodejsFunction,
  type NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import path from "path";

export interface NodejsFunctionFromEntryProps extends Omit<
  NodejsFunctionProps,
  "entry"
> {
  /**
   * Path to the TypeScript handler source file
   * (e.g. `'runtime/handlers/fetch-data.ts'`).
   */
  readonly entry: string;
  /**
   * Base directory to resolve `entry` from.
   * Typically set to `import.meta.dirname` of the calling module.
   */
  readonly baseDir: string;
}

/**
 * A self-contained construct that wraps `NodejsFunction` and resolves a
 * source `entry` path to a handler file.
 *
 * Consumers specify a relative handler path and a `baseDir`; the absolute
 * entry is resolved internally — similar to how `StepFunctionFromFile`
 * resolves its `filepath`.
 *
 * Pair with `NodeJsFunctionDefaultsAspect` to apply runtime, tracing,
 * memory, and timeout defaults automatically.
 *
 * @example
 * ```ts
 * new NodejsFunctionFromEntry(stack, 'FetchData', {
 *   entry: 'runtime/handlers/fetch-data.ts',
 *   baseDir: import.meta.dirname,
 * });
 * ```
 */
export class NodejsFunctionFromEntry extends NodejsFunction {
  constructor(scope: Construct, id: string, props: NodejsFunctionFromEntryProps) {
    const { entry, baseDir, ...rest } = props;

    super(scope, id, { entry: path.resolve(baseDir, entry), ...rest });
  }
}
