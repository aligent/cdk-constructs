---
"@aligent/cdk-secure-rest-api": patch
---

Fix published artifact: declarations (`*.d.ts`) were missing from the tarball because the package had no `.npmignore`, so `npm pack` fell back to the workspace `.gitignore` (which excludes build outputs). Consumers with `isolatedModules: true` then resolved `index.ts` directly and hit `TS1205` on the type re-exports. This release adds the package's own `.npmignore` (matching sibling packages) and converts the type re-exports in `index.ts` to `export type`.
