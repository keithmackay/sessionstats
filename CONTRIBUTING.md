# Contributing to sessionstats

Contributions are welcome! This document covers how to report bugs, suggest features, and submit changes.

## Reporting Bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include your OS, Node version, and (if possible) the relevant excerpt of `.sessionstats/session_stats.json` with any sensitive project details redacted.

## Suggesting Features

Open an issue using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Describe the problem you're trying to solve before proposing a specific solution — it makes it easier to evaluate alternatives.

## Development Setup

```bash
git clone https://github.com/keithmackay/sessionstats.git
cd sessionstats
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build hooks
npm run build
```

Tests run with [Vitest](https://vitest.dev/); test files live under `tests/unit/`.

## Pull Request Process

1. Fork the repository and create a feature branch (`feature/short-description` or `fix/short-description`)
2. Write tests for any new functionality
3. Ensure `npm test` passes and `npm run build` succeeds
4. Write clear, focused commit messages describing *why* the change was made
5. Open a pull request using the [PR template](.github/pull_request_template.md)

## Code Style

Follow the existing TypeScript conventions in `src/` — the codebase has no separate linter config, so match the formatting and structure of the file you're editing (see `src/lib/` for the prevailing style).
