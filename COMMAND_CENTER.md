# Command Center (Multi-repo Agent Management)

Command Center is a lightweight control plane that **aggregates and proxies** Agent Orchestrator operations across **many repositories** (orchestrator instances).

It stores a registry of “repos” (name + orchestrator base URL + optional API key) and exposes a single API to:

- list registered repos
- create agents / enqueue runs per repo
- aggregate agents and runs across all repos

## Run locally

```bash
cd apps/command-center
npm run dev
```

Defaults:

- Command Center API: `http://localhost:4100`
- Store file: `./command-center-store.json` (configurable via `COMMAND_CENTER_STORE_PATH`)

## Register a repo (example)

Register an orchestrator that’s running at `http://localhost:5000`:

```bash
curl -sS -X POST "http://localhost:4100/api/v1/command-center/repos" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-ai","orchestratorBaseUrl":"http://localhost:5000"}'
```

If the orchestrator requires an API key (`ORCH_REQUIRE_API_KEY=true`), include `apiKey`:

```bash
curl -sS -X POST "http://localhost:4100/api/v1/command-center/repos" \
  -H "Content-Type: application/json" \
  -d '{"name":"prod-repo","orchestratorBaseUrl":"https://ai.example.com","apiKey":"<KEY>"}'
```

## Useful endpoints

- `GET /health`
- `GET /api/v1/command-center/repos`
- `POST /api/v1/command-center/repos`
- `GET /api/v1/command-center/repos/:repoId/agents`
- `POST /api/v1/command-center/repos/:repoId/agents`
- `GET /api/v1/command-center/repos/:repoId/runs`
- `POST /api/v1/command-center/repos/:repoId/runs`
- `GET /api/v1/command-center/runs` (aggregated)
- `GET /api/v1/command-center/agents` (aggregated)

