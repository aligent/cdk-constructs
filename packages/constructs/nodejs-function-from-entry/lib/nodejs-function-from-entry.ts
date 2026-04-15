import {
  Code,
  Function,
  type FunctionProps,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";

export interface NodejsFunctionFromEntryProps<
  TPrefix extends string = "runtime/handlers/",
> extends Omit<FunctionProps, "code" | "handler" | "runtime"> {
  /**
   * The runtime environment for the Lambda function.
   * Optional when using `NodeJsFunctionDefaultsAspect` to set the runtime via an aspect.
   * @default Runtime.NODEJS_LATEST
   */
  readonly runtime?: FunctionProps["runtime"];
  /**
   * Path to the TypeScript handler source file
   * (e.g. `'runtime/handlers/fetch-data.ts'`).
   */
  readonly entry: `${NoInfer<TPrefix>}${string}`;
  /**
   * Base directory to resolve paths from.
   * Typically set to `import.meta.dirname` of the calling module.
   */
  readonly baseDir: string;
  /**
   * Source path prefix to strip when mapping to the dist output.
   * @default `'runtime/handlers/'`
   */
  readonly sourcePrefix?: string;
  /**
   * Output dist path prefix to substitute in.
   * @default `'../dist/'`
   */
  readonly distPrefix?: string;
}

/**
 * A self-contained construct that wraps `Function` and resolves a
 * source `entry` path to a pre-bundled code asset.
 *
 * Given an entry like `runtime/handlers/fetch-data.ts`, the source prefix
 * and `.ts` extension are stripped, and the dist prefix is prepended to
 * locate the bundled output directory.
 *
 * Pair with `NodeJsFunctionDefaultsAspect` to apply runtime, tracing,
 * memory, and timeout defaults automatically.
 *
 * @example
 * ```ts
 * // Basic usage (entry must start with 'runtime/handlers/' by default)
 * new NodejsFunctionFromEntry(stack, 'FetchData', {
 *   entry: 'runtime/handlers/fetch-data.ts',
 *   baseDir: import.meta.dirname,
 * });
 *
 * // With custom prefix and dist path
 * new NodejsFunctionFromEntry<'src/handlers/'>(stack, 'FetchData', {
 *   entry: 'src/handlers/fetch-data.ts',
 *   baseDir: import.meta.dirname,
 *   sourcePrefix: 'src/handlers/',
 *   distPrefix: '../build/',
 * });
 * ```
 */
export class NodejsFunctionFromEntry<
  TPrefix extends string = "runtime/handlers/",
> extends Function {
  constructor(
    scope: Construct,
    id: string,
    props: NodejsFunctionFromEntryProps<TPrefix>
  ) {
    const {
      entry,
      baseDir,
      sourcePrefix = "runtime/handlers/",
      distPrefix = "../dist/",
      ...rest
    } = props;

    const { code, handler: resolvedHandler } =
      NodejsFunctionFromEntry.resolveEntry(
        entry,
        baseDir,
        sourcePrefix,
        distPrefix
      );

    super(scope, id, {
      code,
      handler: resolvedHandler,
      runtime: Runtime.NODEJS_LATEST,
      ...rest,
    });
  }

  /**
   * Resolves a source entry path to a bundled code asset.
   *
   * Strips the source prefix and `.ts` extension from the entry,
   * prepends the dist prefix, and resolves against the base directory.
   */
  private static resolveEntry(
    entry: string,
    baseDir: string,
    sourcePrefix: string,
    distPrefix: string
  ): { code: Code; handler: string } {
    const escapedPrefix = sourcePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bundledPath = entry.replace(
      new RegExp(`^${escapedPrefix}(.*)\\.ts$`),
      `${distPrefix}$1`
    );

    const target = path.resolve(baseDir, bundledPath);
    const relative = path.relative(baseDir, target);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Invalid file path");
    }

    return {
      code: Code.fromAsset(target),
      handler: "index.handler",
    };
  }
}
