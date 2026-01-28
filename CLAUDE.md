# CLAUDE.md another change

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is an Nx-based monorepo containing AWS CDK v2 construct packages. Each package provides reusable infrastructure components for common AWS patterns.

## Key Commands

### Development
```bash
# Install dependencies
npm ci

# Build a specific package
yarn nx build <package-name>

# Run tests for a package
yarn nx test <package-name>

# Lint a package
yarn nx lint <package-name>

# Run a single test file
yarn nx test <package-name> --testFile=<test-file-name>
```

### Local Testing
```bash
# After building, pack the package
cd dist/<package-name> && npm pack

# Install in your target project
npm i <path-to-tarball>
```

### Publishing
```bash
# Publish with version and tag
yarn nx publish <package-name> --ver=<version> --tag=<tag>
```

## Architecture

### Package Structure
All packages follow this pattern:
```
packages/<package-name>/
├── src/
│   ├── index.ts              # Main exports
│   └── lib/
│       ├── <construct>.ts    # Main CDK construct
│       └── handlers/         # Lambda function code
├── package.json
├── project.json              # Nx configuration
├── tsconfig.json
├── jest.config.ts
└── README.md
```

### Construct Pattern
Each package exports CDK Constructs that:
- Extend the base `Construct` class from AWS CDK
- Accept a typed props interface (e.g., `StaticHostingProps`)
- Create and configure AWS resources
- May include Lambda functions bundled with esbuild

### Key Architectural Decisions
1. **Independent Packages**: Each construct is independently versioned and can be used standalone
2. **Lambda Bundling**: Uses `@aligent/cdk-esbuild` for efficient Lambda deployment
3. **Peer Dependencies**: All packages require `aws-cdk-lib` and `constructs` as peer dependencies
4. **TypeScript**: Entire codebase uses TypeScript with strict mode enabled

### Package Dependencies
- Packages can compose together (e.g., WAF + CloudFront)
- Lambda functions use AWS SDK v3 clients
- Build process uses Nx task orchestration with dependency graph

## Testing Approach
- Jest with ts-jest for all packages
- 80% code coverage threshold
- Mock AWS services in tests
- Test files follow `*.test.ts` pattern

## Code Quality and Git Workflow

### Pre-commit Requirements
**ALWAYS run linting before pushing code to git:**
```bash
# Run lint check for the package being modified
yarn nx lint <package-name>

# Fix any linting issues automatically when possible
yarn nx lint <package-name> --fix
```

### Git Commit Process
1. Make code changes
2. **MANDATORY**: Run `yarn nx lint <package-name>` to check for linting issues
3. Fix any linting errors or warnings
4. Stage changes with `git add`
5. Commit with descriptive message
6. Push to remote

**Never push code that fails linting checks** - this will cause GitHub Actions to fail and block the PR.
