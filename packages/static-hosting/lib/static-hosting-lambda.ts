import { CfnOutput, Construct } from "@aws-cdk/core";
import { ArbitraryPathRemapFunction } from "./arbitrary-path-remap";

export interface StaticHostingLambdaProps {
    robotsBackendPath: string;
    sitemapBackendPaths: string[];
}

export class StaticHostingLambda extends Construct {
    constructor(scope: Construct, id: string, props: StaticHostingLambdaProps) {
        super(scope, id);

        if (props.robotsBackendPath) {
            const robotsRemapFunction = new ArbitraryPathRemapFunction(this, 'robots-remap-function', {path: props.robotsBackendPath});
            new CfnOutput(this, 'robots-remap', {
                description: 'robots-remap',
                value: robotsRemapFunction.edgeFunction.currentVersion.edgeArn
            });
        }

        if (props.sitemapBackendPaths) {
            for (const path in props.sitemapBackendPaths) {
                const sitemapRemapPath = new ArbitraryPathRemapFunction(this, `sitemap-remap-function-${path}`, {path: path});
                new CfnOutput(this, `sitemap-remap-${path}`, {
                    description: `sitemap-remap-${path}`,
                    value: sitemapRemapPath.edgeFunction.currentVersion.edgeArn
                });
            }
        }
    }  
}
