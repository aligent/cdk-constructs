import {
  Duration,
  type InjectionContext,
  type IPropertyInjector,
} from "aws-cdk-lib";
import {
  Code,
  Function as LambdaFunction,
  Runtime,
  Tracing,
  type FunctionProps,
} from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import path from "path";

interface ResolverConfig {
  /** Base directory to resolve entry paths from. */
  baseDir: string;
  /** Source path prefix to strip (e.g. `'runtime/handlers/'`). @default `'runtime/handlers/'` */
  sourcePrefix?: string;
  /** Output dist path prefix to substitute in (e.g. `'../dist/'`). @default `'../dist/'` */
  distPrefix?: string;
  /** Lambda handler export name. @default `'index.handler'` */
  handler?: string;
}

interface FunctionDefaultsConfig {
  runtime: Runtime;
  /** @default true */
  sourceMap?: boolean;
  /** @default 256 */
  memorySize?: number;
  /** Timeout in seconds. @default 3 */
  timeout?: number;
  /** When provided, enables `entry` prop support on Function to auto-resolve pre-built code. */
  resolver?: ResolverConfig;
}

/**
 * Props for {@link PrebuiltFunction}. Replaces `code`, `handler`, and `runtime`
 * with a single `entry` path that the {@link FunctionDefaultsInjector} resolves
 * to a pre-built dist asset at construction time.
 */
export type FunctionEntryProps = Omit<
  FunctionProps,
  "code" | "handler" | "runtime"
> & {
  /** Path to the TypeScript handler source file (e.g. `'runtime/handlers/fetch-data.ts'`). */
  entry: string;
  code?: never;
  handler?: never;
  runtime?: Runtime;
};

/**
 * PropertyInjector that applies defaults to all `lambda.Function` constructs at construction time.
 *
 * When a `resolver` is configured, consumers can pass an `entry` path instead of
 * `code`/`handler` — the injector resolves the pre-built dist asset automatically.
 *
 * @example
 * ```ts
 * // Register the injector at the app or stack level
 * const app = new App({
 *   propertyInjectors: [
 *     new FunctionDefaultsInjector({
 *       runtime: Runtime.NODEJS_22_X,
 *       resolver: { baseDir: import.meta.dirname },
 *     }),
 *   ],
 * });
 *
 * // Consumer just provides the entry path — no resolveLambdaHandler() needed
 * new Function(stack, 'FetchData', {
 *   entry: 'runtime/handlers/fetch-data.ts',
 * } as FunctionEntryProps);
 *
 * // Or provide code/handler directly — defaults still applied
 * new Function(stack, 'FetchData', {
 *   code: Code.fromAsset('dist/fetch-data'),
 *   handler: 'index.handler',
 * });
 * ```
 */
export class FunctionDefaultsInjector implements IPropertyInjector {
  readonly constructUniqueId = LambdaFunction.PROPERTY_INJECTION_ID;

  private readonly config: Required<Omit<FunctionDefaultsConfig, "resolver">> &
    Pick<FunctionDefaultsConfig, "resolver">;

  constructor(config: FunctionDefaultsConfig) {
    this.config = {
      ...config,
      sourceMap: config.sourceMap ?? true,
      memorySize: config.memorySize ?? 256,
      timeout: config.timeout ?? 3,
    };
  }

  inject(
    originalProps: FunctionProps & { entry?: string },
    _context: InjectionContext
  ): FunctionProps {
    const { entry, ...consumerProps } = originalProps;

    // Resolve entry path to code/handler if resolver is configured
    let resolvedCode: { code: Code; handler: string } | undefined;
    if (entry && this.config.resolver) {
      resolvedCode = this.resolveEntry(entry);
    }

    const defaults: Partial<FunctionProps> = {
      runtime: this.config.runtime,
      tracing: Tracing.ACTIVE,
      memorySize: this.config.memorySize,
      timeout: Duration.seconds(this.config.timeout),
      ...(this.config.sourceMap && {
        environment: { NODE_OPTIONS: "--enable-source-maps" },
      }),
      ...resolvedCode,
    };

    return {
      ...defaults,
      ...consumerProps,
      // Merge environment maps so consumer additions don't overwrite source-map config
      environment: {
        ...(defaults.environment ?? {}),
        ...(consumerProps.environment ?? {}),
      },
    } as FunctionProps;
  }

  private resolveEntry(entry: string): { code: Code; handler: string } {
    const {
      baseDir,
      sourcePrefix = "runtime/handlers/",
      distPrefix = "../dist/",
      handler = "index.handler",
    } = this.config.resolver!;

    const escapedPrefix = sourcePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bundledPath = entry.replace(
      new RegExp(`^${escapedPrefix}(.*)\\.ts$`),
      `${distPrefix}$1`
    );

    return {
      code: Code.fromAsset(path.resolve(baseDir, bundledPath)),
      handler,
    };
  }
}

/**
 * A thin wrapper around `lambda.Function` that accepts {@link FunctionEntryProps}.
 *
 * Requires a {@link FunctionDefaultsInjector} with `resolver` to be registered
 * on a parent scope — the injector resolves `entry` into `code`/`handler` at
 * construction time.
 *
 * @example
 * ```ts
 * new BundleFunction(stack, 'FetchData', {
 *   entry: 'runtime/handlers/fetch-data.ts',
 * });
 * ```
 */
export class BundleFunction extends LambdaFunction {
  constructor(
    scope: Construct,
    id: string,
    props: FunctionEntryProps | FunctionProps
  ) {
    super(scope, id, props as FunctionProps);
  }
}
