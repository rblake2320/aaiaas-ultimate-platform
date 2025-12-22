## Agent Orchestrator (24/7 persistent agents)

This repo now includes a **durable background worker** that continuously executes agent jobs and survives restarts.

### What you get

- **Persistent job queue**: SQLite-backed `orchestrator.db` (WAL mode).
- **Crash recovery**: runs claimed with a lease; expired leases are recovered to `retry`.
- **Retries**: exponential backoff with jitter, up to `max_attempts`.
- **Recurring runs**: set `interval_seconds` to re-queue after success.
- **Event log**: every state transition and result is stored as an event.

### Run the orchestrator worker

From the repo root:

```bash
cd apps/api-ai
export ORCH_DB_PATH=./orchestrator.db
python orchestrator_main.py
```

### Use the API to enqueue work

Start the AI API as usual:

```bash
cd apps/api-ai
python -m uvicorn main:app --reload --port 5000
```

Then create an agent and enqueue a run:

```bash
curl -s -X POST "http://localhost:5000/api/v1/orchestrator/agents" \
  -H "Content-Type: application/json" \
  -d '{"name":"Daily reporter","agent_type":"analyst","model":"gpt-4.1-mini","temperature":0.2,"max_iterations":6}'
```

```bash
curl -s -X POST "http://localhost:5000/api/v1/orchestrator/runs" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<AGENT_ID>","task":"Summarize yesterday\\u2019s events in 5 bullets","max_attempts":5}'
```

Inspect run status and events:

```bash
curl -s "http://localhost:5000/api/v1/orchestrator/runs?limit=20"
curl -s "http://localhost:5000/api/v1/orchestrator/runs/<RUN_ID>/events"
```

### Environment variables

- **`ORCH_DB_PATH`**: SQLite DB file path (default: `./orchestrator.db` in the current working directory)
- **`ORCH_CONCURRENCY`**: number of concurrent runs per worker (default: `2`)
- **`ORCH_LEASE_SECONDS`**: lease duration for claimed runs (default: `120`)
- **`ORCH_POLL_INTERVAL_SECONDS`**: polling interval (default: `1`)
- **`ORCH_RECOVER_INTERVAL_SECONDS`**: how often to recover expired leases (default: `30`)
- **`ORCH_REQUIRE_API_KEY`**: if `true`, orchestrator endpoints require `Authorization` header

