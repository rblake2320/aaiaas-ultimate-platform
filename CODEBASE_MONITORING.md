# Codebase Monitoring

This repo includes a lightweight, dependency-free scanner that searches the codebase for common risks:

- **Likely leaked secrets / tokens** (high severity)
- **Private key material** (high severity)
- **Committed `.env` files** (high severity)
- **High-risk APIs** like `eval`, `child_process.exec`, `shell=True` (medium severity)
- **Work-in-progress markers** (low severity)

## Run locally

From the repo root:

```bash
npm run monitor:codebase
```

Or run the script directly:

```bash
node scripts/codebase-monitor.js --format text --out reports/codebase-monitor-report.json
```

## Output

- **Console output**: human-readable summary (`--format text`) or full JSON (`--format json`)
- **Report file**: `reports/codebase-monitor-report.json` (ignored by git)

## CI / GitHub Actions

The workflow `.github/workflows/codebase-monitor.yml` runs on pushes and pull requests.

- The job **fails only on `high` severity** findings by default (to avoid noisy PR failures).
- The JSON report is uploaded as an artifact named `codebase-monitor-report`.

## Configuration

Edit `codebase-monitor.config.json` to customize:

- `ignoreDirs`, `ignoreFiles`
- `maxFileSizeBytes`
- `allowlistPathContains` (paths that can contain placeholder secrets like `.env.example`)
- `failOn` (e.g. `["high", "medium"]`)

