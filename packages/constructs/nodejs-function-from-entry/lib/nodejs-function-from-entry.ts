import { Code } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import path from "path";

export interface NodejsFunctionFromEntryProps<
  TPrefix extends string = "runtime/handlers/",
> extends Omit<NodejsFunctionProps, "code" | "handler"> {
  /**
   * Base directory to resolve paths from.
   * Typically set to `import.meta.dirname` of the calling module.
   */
  readonly baseDir: string;
  /**
   * Path to the TypeScript handler source file
   * (e.g. `'runtime/handlers/fetch-data.ts'`).
   */
  readonly entry: `${NoInfer<TPrefix>}${string}`;
  /**
   * Source path prefix (relative to baseDir) to strip when mapping to the dist output.
   * @default `'runtime/handlers/'`
   */
  readonly sourcePrefix?: TPrefix;
  /**
   * Output dist path prefix to substitute in (relative to baseDir)
   * @default `'../dist/'`
   */
  readonly distPrefix?: string;
  /**
   * Parent directory name used to determine the allowed root for path traversal.
   * The allowed root is the first ancestor whose parent matches this name.
   * @default `'services'`
   */
  readonly rootParentDir?: string;
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
 * // With custom prefix and dist path (TPrefix inferred from sourcePrefix)
 * new NodejsFunctionFromEntry(stack, 'FetchData', {
 *   entry: 'src/handlers/fetch-data.ts',
 *   baseDir: import.meta.dirname,
 *   sourcePrefix: 'src/handlers/',
 *   distPrefix: '../build/',
 * });
 * ```
 */
export class NodejsFunctionFromEntry<
  TPrefix extends string = "runtime/handlers/",
> extends NodejsFunction {
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
      rootParentDir = "services",
      ...rest
    } = props;

    const { code, handler: resolvedHandler } =
      NodejsFunctionFromEntry.resolveEntry(
        entry,
        baseDir,
        sourcePrefix,
        distPrefix,
        rootParentDir
      );

    super(scope, id, { code, handler: resolvedHandler, ...rest });
  }

  /**
   * Walks up from the given directory until it finds a path
   * whose parent directory is named `services` (e.g. `services/companies`).
   */
  private static findServiceRoot(dir: string, rootParentDir: string): string {
    let current = path.resolve(dir);
    const root = path.parse(current).root;

    while (current !== root) {
      if (path.basename(path.dirname(current)) === rootParentDir) {
        return current;
      }
      current = path.dirname(current);
    }

    throw new Error(
      `Could not find a '${rootParentDir}/<name>' ancestor from ${dir}`
    );
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
    distPrefix: string,
    rootParentDir: string
  ): { code: Code; handler: string } {
    const escapedPrefix = sourcePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bundledPath = entry.replace(
      new RegExp(`^${escapedPrefix}(.*)\\.ts$`),
      `${distPrefix}$1`
    );

    const target = path.resolve(baseDir, bundledPath);
    const allowedRoot = NodejsFunctionFromEntry.findServiceRoot(
      baseDir,
      rootParentDir
    );

    if (!target.startsWith(allowedRoot + path.sep) && target !== allowedRoot) {
      throw new Error(
        `Path traversal detected: resolved path '${target}' is outside allowed root '${allowedRoot}'`
      );
    }

    return {
      code: Code.fromAsset(target),
      handler: "index.handler",
    };
  }
}
