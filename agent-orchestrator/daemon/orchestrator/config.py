from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


RepoType = Literal["local", "github"]


class RepoConfig(BaseModel):
    name: str
    type: RepoType

    # local
    path: str | None = None

    # github
    owner: str | None = None
    repo: str | None = None
    default_branch: str | None = "main"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AO_", extra="ignore")

    http_host: str = "0.0.0.0"
    http_port: int = 8080

    poll_interval_seconds: int = 30
    db_path: str = "/data/orchestrator.sqlite3"
    repo_cache_dir: str = "/data/repos"

    # JSON list of repos
    repos: str = "[]"

    # If set, agents may run potentially dangerous commands.
    # Default is false to be safe for local runs.
    allow_command_exec: bool = False

    def parsed_repos(self) -> list[RepoConfig]:
        try:
            raw: Any = json.loads(self.repos or "[]")
        except json.JSONDecodeError as e:
            raise ValueError("AO_REPOS must be valid JSON") from e
        if not isinstance(raw, list):
            raise ValueError("AO_REPOS must be a JSON list")
        return [RepoConfig.model_validate(item) for item in raw]


class RuntimeState(BaseModel):
    started_at_unix: float
    last_scan_at_unix: float | None = None
    last_scan_summary: dict[str, Any] = Field(default_factory=dict)

