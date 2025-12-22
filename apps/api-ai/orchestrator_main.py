"""
Standalone entrypoint for the Agent Orchestrator.

Run:
  cd apps/api-ai
  ORCH_DB_PATH=./orchestrator.db python orchestrator_main.py
"""

from __future__ import annotations

from services.orchestrator import AgentOrchestrator, load_orchestrator_config_from_env


def main() -> None:
    cfg = load_orchestrator_config_from_env()
    orch = AgentOrchestrator(cfg)
    orch.run_forever()


if __name__ == "__main__":
    main()

