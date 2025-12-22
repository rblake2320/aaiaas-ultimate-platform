# The Sentinel (apps/sentinel)

The Sentinel is an autonomous issue detection and resolution system for this monorepo.

It provides a **single CLI** that can:

- Run repo health checks (lint, type-check, build, tests, Python syntax compilation)
- Parse failures into structured findings
- (Optionally) ask an LLM to propose patches
- Apply patches safely and prepare a PR workflow (optional)
- Pull GitHub issues / CI failures using `gh`

See [`/workspace/SENTINEL.md`](../../SENTINEL.md) for full docs and configuration.

