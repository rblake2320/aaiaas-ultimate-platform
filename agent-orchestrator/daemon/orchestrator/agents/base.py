from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Any, Literal

from orchestrator.config import Settings
from orchestrator.db.work_items import WorkItem
from orchestrator.repos.base import RepoMonitor


AgentOutcome = Literal["completed", "failed", "skipped"]


@dataclass(frozen=True)
class AgentResult:
    outcome: AgentOutcome
    message: str
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class AgentContext:
    settings: Settings
    monitors_by_repo: dict[str, RepoMonitor]


class Agent(abc.ABC):
    name: str

    @abc.abstractmethod
    def can_handle(self, item: WorkItem) -> bool:  # pragma: no cover
        raise NotImplementedError

    @abc.abstractmethod
    async def run(self, ctx: AgentContext, item: WorkItem) -> AgentResult:  # pragma: no cover
        raise NotImplementedError

