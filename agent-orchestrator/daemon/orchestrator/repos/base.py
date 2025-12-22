from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RepoSnapshot:
    repo_name: str
    kind: str
    default_branch: str | None
    head_sha: str | None
    metadata: dict[str, Any]


class RepoMonitor(abc.ABC):
    @property
    @abc.abstractmethod
    def repo_name(self) -> str:  # pragma: no cover
        raise NotImplementedError

    @abc.abstractmethod
    async def snapshot(self) -> RepoSnapshot:  # pragma: no cover
        raise NotImplementedError

    async def list_open_issues(self, limit: int = 20) -> list[dict[str, Any]]:
        return []

