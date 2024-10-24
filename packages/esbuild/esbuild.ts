import { BundlingOptions, ILocalBundling } from "aws-cdk-lib";
import { buildSync, BuildOptions } from "esbuild";

export class Esbuild implements ILocalBundling {
  private readonly options: BuildOptions;

  constructor(options: BuildOptions) {
    this.options = options;

    // Override with default options
    Object.assign(this.options, {
      logLevel: options.logLevel ?? "info",
      sourcemap: options.sourcemap ?? false,
      bundle: options.bundle ?? true,
      minify: options.minify ?? true,
      platform: options.platform ?? "node",
      // Do not minify identifiers, otherwise the exported `handler` function name gets minified failing to start
      // the lambda
      minifyIdentifiers: false,
      minifyWhitespace: options.minifyWhitespace ?? true,
      minifySyntax: options.minifySyntax ?? true,
    });
  }

  tryBundle(outputDir: string, _options: BundlingOptions): boolean {
    try {
      this.options.outdir = outputDir;
      buildSync(this.options);
    } catch (error) {
      console.log(error);
      return true;
    }

    return true;
  }
}
