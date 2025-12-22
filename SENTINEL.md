# The Sentinel — autonomous issue detection & resolution

The Sentinel is a repo-native system that **detects**, **triages**, and (optionally) **proposes fixes** for issues in this codebase.

It is designed to work in three modes:

- **Local**: run checks, get a structured report, generate a plan/patch.
- **CI intake**: run on GitHub Actions to flag failures and attach artifacts.
- **Autonomous fixing (optional)**: call an LLM via `apps/api-ai` to propose `git apply`-compatible patches.

## Install

From repo root:

```bash
python3 -m pip install -r apps/sentinel/requirements.txt
```

## Quick start

Run checks and emit a report:

```bash
python3 apps/sentinel/main.py scan --config .sentinel.yml
```

Summarize a report:

```bash
python3 apps/sentinel/main.py diagnose .sentinel/reports/<report>.json
```

Create a plan (no LLM):

```bash
python3 apps/sentinel/main.py propose .sentinel/reports/<report>.json --provider none
```

Optionally apply a generated `.diff`:

```bash
python3 apps/sentinel/main.py apply .sentinel/patches/<patch>.diff --check
python3 apps/sentinel/main.py apply .sentinel/patches/<patch>.diff
```

## Configuration

Sentinel reads a YAML config (default: `.sentinel.yml`).

Each **check** is just a shell command plus metadata:

- **id**: stable identifier used for filtering (`--only`)
- **command**: shell command to run
- **cwd**: working directory relative to repo root
- **timeout_sec**: per-check timeout
- **required_tools**: binaries that must exist (otherwise the check is skipped)

See `.sentinel.example.yml` for examples.

## GitHub intake (via `gh`)

Sentinel can list failures and issues using GitHub CLI:

```bash
python3 apps/sentinel/main.py gh failed-runs --limit 20
python3 apps/sentinel/main.py gh issues --label sentinel --state open
```

## Optional: autonomous patch proposals (LLM)

Sentinel can ask an LLM to generate a **unified diff** patch. The default provider is `api-ai`,
which calls this repo’s FastAPI service in `apps/api-ai` (and that service calls OpenAI).

### Required environment variables

- **SENTINEL_API_AI_URL**: defaults to `http://localhost:5000/api/v1/chat`
- **SENTINEL_API_AI_KEY**: sent as `Authorization: Bearer ...` to the AI API

Generate a patch:

```bash
python3 apps/sentinel/main.py propose .sentinel/reports/<report>.json --provider api-ai --model gpt-4.1-mini
```

Notes:

- Sentinel **does not** apply patches automatically unless you run `sentinel apply`.
- If the LLM can’t produce a safe change, it should return an **empty diff**.

