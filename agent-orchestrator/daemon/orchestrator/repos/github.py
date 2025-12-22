from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx

from orchestrator.repos.base import RepoMonitor, RepoSnapshot


@dataclass(frozen=True)
class GitHubRepoMonitor(RepoMonitor):
    name: str
    owner: str
    repo: str
    default_branch: str = "main"

    @property
    def repo_name(self) -> str:
        return self.name

    def _client(self) -> httpx.AsyncClient:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return httpx.AsyncClient(base_url="https://api.github.com", headers=headers, timeout=20.0)

    async def snapshot(self) -> RepoSnapshot:
        async with self._client() as client:
            repo_resp = await client.get(f"/repos/{self.owner}/{self.repo}")
            repo_ok = repo_resp.status_code == 200
            repo_json: dict[str, Any] = repo_resp.json() if repo_ok else {}

            branch = self.default_branch or repo_json.get("default_branch") or "main"
            commit_resp = await client.get(f"/repos/{self.owner}/{self.repo}/commits/{branch}")
            commit_ok = commit_resp.status_code == 200
            commit_json: dict[str, Any] = commit_resp.json() if commit_ok else {}

            head_sha = None
            if commit_ok:
                head_sha = commit_json.get("sha")

            return RepoSnapshot(
                repo_name=self.name,
                kind="github",
                default_branch=branch,
                head_sha=head_sha,
                metadata={
                    "owner": self.owner,
                    "repo": self.repo,
                    "repo_status_code": repo_resp.status_code,
                    "commit_status_code": commit_resp.status_code,
                    "html_url": repo_json.get("html_url"),
                    "open_issues_count": repo_json.get("open_issues_count"),
                },
            )

    async def list_open_issues(self, limit: int = 20) -> list[dict[str, Any]]:
        async with self._client() as client:
            resp = await client.get(
                f"/repos/{self.owner}/{self.repo}/issues",
                params={"state": "open", "per_page": str(limit), "sort": "updated", "direction": "desc"},
            )
            if resp.status_code != 200:
                return []
            items = resp.json()
            # Filter out pull requests (GitHub represents PRs in /issues with pull_request key)
            if isinstance(items, list):
                return [i for i in items if isinstance(i, dict) and "pull_request" not in i]
            return []

