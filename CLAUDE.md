# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Nx-based monorepo of independently versioned AWS CDK v2 construct packages published under the `@aligent/cdk-*` scope. Yarn 4 (Berry) workspaces, managed via Corepack. Node version is pinned in `.nvmrc`.

Workspaces:
- `packages/constructs/*` — one CDK construct per directory (e.g. `static-hosting`, `waf`, `prerender-fargate`)
- `packages/cdk-aspects` — shared CDK aspects

## Key Commands

### Setup and development
```bash
# Install dependencies (matches CI)
yarn install --frozen-lockfile

# Build / test / lint a single package (use the project name from project.json, not the npm name)
yarn nx build <package-name>
yarn nx test <package-name>
yarn nx lint <package-name>

# Run a single test file
yarn nx test <package-name> --testFile=<test-file-name>

# Run tests across the whole monorepo
yarn nx run-many -t test
```

### Affected-only (mirrors CI)
CI runs `nx affected` against `origin/main`. To reproduce locally:
```bash
yarn nx affected:lint  --base=origin/main
yarn nx affected:build --base=origin/main
yarn nx affected:test  --base=origin/main

# List affected @aligent/cdk-* packages — useful when adding a changeset
yarn affected:packages
```

### Local consumption of a package
Build target outputs in place (`outDir: "."`), not into `dist/`. To consume in another project:
```bash
yarn nx build <package-name>
cd packages/constructs/<package-name> && npm pack
# then in the target project: npm i <path-to-tarball>
```

### Releases (Changesets)
This repo uses [Changesets](https://github.com/changesets/changesets); each package has an independent release cycle. Manual `npm publish` / `nx publish` is **not** the normal flow.

Every PR that modifies a published package must include a changeset file in `.changeset/`. On merge to `main`, the `changeset-release` workflow opens/updates a "Release: Version Packages" PR; merging that PR publishes to npm and creates GitHub releases.

**Before writing a changeset, confirm with the user:**
- which package(s) are affected
- the bump type (`patch` for bug fixes / non-breaking tweaks, `minor` for backwards-compatible features, `major` for breaking changes)
- the description

Then either run `yarn changeset` (interactive) or create `.changeset/<descriptive-slug>.md` directly:

```markdown
---
"@aligent/<package-name>": patch | minor | major
---

Short description of the change.
```

Useful commands:
```bash
yarn changeset:status    # see pending changesets
yarn affected:packages   # list affected @aligent/cdk-* packages — handy when picking targets
```

## Architecture

### Package layout
```
packages/constructs/<name>/
├── index.ts                  # main exports
├── lib/
│   ├── <construct>.ts        # CDK construct(s)
│   └── handlers/             # Lambda source (excluded from tsc build; bundled via esbuild at synth time)
├── project.json              # Nx targets: build / lint / test / publish
├── package.json              # @aligent/cdk-<name>, peer-deps aws-cdk-lib + constructs
├── tsconfig.json / tsconfig.app.json / tsconfig.spec.json
├── jest.config.ts
└── README.md
```
After `nx build`, compiled `index.js` / `index.d.ts` (and `lib/*.js`) sit next to the sources — that is what gets published.

### Construct pattern
Each package exports CDK Constructs that extend `Construct`, accept a typed props interface, and create AWS resources. Lambda handlers under `lib/handlers/` are excluded from the package's `tsc` build and are bundled via `@aligent/cdk-esbuild` during CDK synth (using AWS SDK v3 clients).

### Cross-package rules
- `aws-cdk-lib` and `constructs` are **peer** dependencies in every package — do not add them as regular `dependencies`.
- ESLint enforces Nx module boundaries; the only cross-package import explicitly allowed is `@aligent/cdk-esbuild` (see `.eslintrc.json`). New cross-package coupling needs an explicit allowlist entry.
- `constructs` is pinned via a workspace-level `resolutions` entry in the root `package.json`.

## Testing
- Jest + ts-jest, `*.test.ts` pattern, 80% coverage threshold per package.
- Mock AWS SDK calls (e.g. `aws-sdk-client-mock`); do not hit real AWS.

## Code Quality and Git Workflow

### Pre-commit
Always lint the affected package before pushing — CI runs `nx affected:lint` and will block the PR otherwise:
```bash
yarn nx lint <package-name>
yarn nx lint <package-name> --fix    # auto-fix where possible
```

### PRs
- One logical change per PR.
- Include a changeset for any user-visible change to a published package (see [Releases (Changesets)](#releases-changesets) above).
- The `check-readme` workflow flags missing README updates — keep the package README in sync with functional changes.
