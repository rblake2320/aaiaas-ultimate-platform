from __future__ import annotations

import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Repo Manager configuration.

    Uses conventional GitHub App env vars (no prefix) + a few REPO_MANAGER_* vars.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Storage
    repo_manager_data_dir: str = Field(default="/workspace/.repo-manager", alias="REPO_MANAGER_DATA_DIR")
    repo_manager_db_path: Optional[str] = Field(default=None, alias="REPO_MANAGER_DB_PATH")
    repo_manager_repos_dir: Optional[str] = Field(default=None, alias="REPO_MANAGER_REPOS_DIR")

    # GitHub App
    github_app_id: int = Field(alias="GITHUB_APP_ID")
    github_app_private_key: str = Field(alias="GITHUB_APP_PRIVATE_KEY")
    github_webhook_secret: str = Field(default="", alias="GITHUB_WEBHOOK_SECRET")

    # Orchestrator API (apps/api-ai)
    orch_api_base_url: str = Field(
        default="http://localhost:5000/api/v1/orchestrator",
        alias="ORCH_API_BASE_URL",
    )
    orch_api_key: Optional[str] = Field(default=None, alias="ORCH_API_KEY")

    # Sentinel dispatch behavior
    sentinel_agent_id: Optional[str] = Field(default=None, alias="SENTINEL_AGENT_ID")
    sentinel_agent_name: str = Field(default="Sentinel", alias="SENTINEL_AGENT_NAME")
    sentinel_agent_type: str = Field(default="analyst", alias="SENTINEL_AGENT_TYPE")
    clone_on_event: bool = Field(default=True, alias="REPO_MANAGER_CLONE_ON_EVENT")

    @property
    def db_path(self) -> str:
        if self.repo_manager_db_path:
            return self.repo_manager_db_path
        return os.path.join(self.repo_manager_data_dir, "registry.db")

    @property
    def repos_dir(self) -> str:
        if self.repo_manager_repos_dir:
            return self.repo_manager_repos_dir
        return os.path.join(self.repo_manager_data_dir, "repos")


def get_settings() -> Settings:
    return Settings()

