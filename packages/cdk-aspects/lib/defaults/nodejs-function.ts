import { type IAspect } from 'aws-cdk-lib';
import { CfnFunction, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IConstruct } from 'constructs';

interface Config {
    runtime: Runtime;
    sourceMap?: boolean;
}

/**
 * Aspect that automatically applies configuration-aware defaults to Node.js Lambda functions
 *
 * Visits all constructs in the scope and automatically applies configuration-specific runtime, tracing, and environment settings to Node.js Lambda functions.
 * Different configurations can optimize for different priorities such as build speed, bundle size, or debugging capabilities.
 *
 * @example
 * ```typescript
 * // Apply configuration-specific defaults to all Node.js functions
 * Aspects.of(app).add(new NodeJsFunctionDefaultsAspect({
 *   runtime: Runtime.NODEJS_24_X,
 *   sourceMap: true,
 * }));
 *
 * // Functions automatically inherit configuration defaults
 * new NodejsFunction(stack, 'MyFunction', {
 *   code: Code.fromAsset('src/lambda'),
 *   handler: 'index.handler',
 *   // runtime, tracing, and source map support applied automatically
 * });
 * ```
 *
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs.NodejsFunction.html
 */
export class NodeJsFunctionDefaultsAspect implements IAspect {
    private readonly config: Required<Config>;

    /**
     * Creates a new NodeJsFunctionDefaultsAspect
     *
     * @param config - Configuration identifier used to select appropriate defaults.
     */
    constructor(config: Config) {
        this.config = { ...config, sourceMap: config.sourceMap ?? true };
    }

    /**
     * Visits a construct and applies runtime and tracing settings if it's a NodejsFunction
     *
     * Applies configuration-specific runtime, tracing, and environment settings to Node.js
     * Lambda functions that don't already have these properties explicitly set.
     *
     * @param node - The construct to potentially modify
     */
    visit(node: IConstruct): void {
        if (node instanceof NodejsFunction) {
            const cfnFunction = node.node.defaultChild as CfnFunction;

            if (cfnFunction) {
                cfnFunction.runtime = this.config.runtime.name;
            }

            if (cfnFunction && cfnFunction.tracingConfig === undefined) {
                cfnFunction.tracingConfig = { mode: Tracing.ACTIVE };
            }

            if (this.config.sourceMap) {
                node.addEnvironment('NODE_OPTIONS', '--enable-source-maps');
            }
        }
    }
}
