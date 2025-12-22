from __future__ import annotations

from orchestrator.agents.base import Agent, AgentContext, AgentResult
from orchestrator.db.work_items import WorkItem


class NoopAgent(Agent):
    name = "noop"

    def can_handle(self, item: WorkItem) -> bool:
        return True

    async def run(self, ctx: AgentContext, item: WorkItem) -> AgentResult:
        _ = ctx
        return AgentResult(outcome="skipped", message=f"No agent configured to handle type={item.type}")

