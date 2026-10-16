# Contributing to NodeCore

Thank you for your interest in improving NodeCore. This guide explains how to
set up the workspace, what we expect from a change, and how to submit it.

## Prerequisites

- Node.js 22 or later
- Corepack enabled (`corepack enable`), which provides the Yarn version pinned
  in `package.json`

## Reporting issues

Open an issue with a clear title, the Node.js and package versions you use,
the steps to reproduce the problem, and what you expected to happen. Minimal
reproductions are the fastest way to get a fix.

## Before submitting a pull request

1. Discuss significant API changes before implementing them.
2. Add or update automated tests.
3. Update documentation when public behavior changes.
4. Run the build, tests and lint checks.
5. Keep changes focused and backward compatible whenever possible.

## Development commands

```bash
yarn install
yarn build
yarn test
yarn lint
yarn format:check
```

# Pull requests

Describe the motivation, implementation, tests and any breaking changes.
Keep each pull request focused on a single concern, and make sure the CI
checks (build, test, lint and formatting) pass before requesting a review.

## Code style

Formatting is enforced by Prettier. Run `yarn format` to format your changes
before committing.

# Public API

Changes to exported types, classes, methods and package exports must be
reviewed for backward compatibility.
