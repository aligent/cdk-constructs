import type { IConstruct } from "constructs";

/**
 * Path fragments identifying CDK-managed singleton/framework resources that
 * consumers cannot configure or own.
 *
 * Aspects should leave these resources untouched: their runtime config is
 * framework-owned (so cdk-nag rules are noise), and their physical names must
 * stay CloudFormation-generated (so a failed deploy's orphaned `/aws/lambda`
 * LogGroup never collides with a deterministic name on the next attempt).
 */
export const CDK_MANAGED_PATH_FRAGMENTS = [
  // aws-s3-deployment.BucketDeployment custom resource handler
  "Custom::CDKBucketDeployment",
  // Deprecated CDK log retention custom resource
  "LogRetention",
  // Bucket(autoDeleteObjects: true)
  "Custom::S3AutoDeleteObjects",
  // cr.Provider framework on-event / is-complete handler
  "AWS679f53fac002430cb0da5b7982bd2287",
];

/**
 * Returns true when the construct lives under a CDK-managed singleton/framework
 * path and should therefore be skipped by aspects.
 */
export function isCdkManagedSingleton(node: IConstruct): boolean {
  const path = node.node.path;
  return CDK_MANAGED_PATH_FRAGMENTS.some(fragment => path.includes(fragment));
}
