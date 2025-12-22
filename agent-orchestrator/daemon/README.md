## Agent Orchestrator — Core Daemon

This service is the always-on core of `/agent-orchestrator`. It:

- Monitors configured repositories (GitHub + local paths)
- Creates and tracks work items (issues, failing checks, drift)
- Runs pluggable agents continuously to attempt auto-fixes
- Exposes a small HTTP API for health/status/control

### Run (local)

```bash
cd /workspace/agent-orchestrator/daemon
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn orchestrator.app:app --host 0.0.0.0 --port 8080
```

### Run (Docker)

```bash
docker build -t agent-orchestrator-daemon .
docker run --rm -p 8080:8080 \
  -e AO_REPOS='[{"name":"workspace","type":"local","path":"/data/workspace"}]' \
  -v /workspace:/data/workspace \
  agent-orchestrator-daemon
```

### Configuration

All configuration is via environment variables:

- `AO_HTTP_HOST` (default: `0.0.0.0`)
- `AO_HTTP_PORT` (default: `8080`)
- `AO_DB_PATH` (default: `/data/orchestrator.sqlite3`)
- `AO_POLL_INTERVAL_SECONDS` (default: `30`)
- `AO_REPOS` JSON list of repos to monitor
  - Local repo example:
    - `[{"name":"workspace","type":"local","path":"/data/workspace"}]`
  - GitHub example:
    - `[{"name":"my-repo","type":"github","owner":"acme","repo":"my-repo","default_branch":"main"}]`
- `GITHUB_TOKEN` optional; required for GitHub API access if private / higher rate limits.

### HTTP API

- `GET /healthz` -> `{ "ok": true }`
- `GET /status` -> daemon status summary + recent work items
- `POST /trigger/scan` -> triggers an immediate scan cycle

