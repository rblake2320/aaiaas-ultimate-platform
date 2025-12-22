"""
GitHub webhook registration (per repository).

This module ensures that each configured repo has a webhook pointing at our
receiver endpoint, creating or updating it idempotently.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx


@dataclass(frozen=True)
class GitHubWebhookSettings:
    token: str
    webhook_url: str
    webhook_secret: str
    repos: Tuple[str, ...]
    events: Tuple[str, ...]
    api_base_url: str = "https://api.github.com"
    content_type: str = "json"
    insecure_ssl: str = "0"  # GitHub expects "0" or "1" (string)


def _split_csv(value: str) -> List[str]:
    parts = []
    for raw in value.replace("\n", ",").replace(" ", ",").split(","):
        v = raw.strip()
        if v:
            parts.append(v)
    return parts


def load_github_webhook_settings_from_env() -> Optional[GitHubWebhookSettings]:
    """
    Returns settings if sufficiently configured, else None.
    """
    token = os.getenv("GITHUB_TOKEN", "").strip()
    webhook_url = os.getenv("GITHUB_WEBHOOK_URL", "").strip()
    webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").strip()
    repos_raw = os.getenv("GITHUB_WEBHOOK_REPOS", "").strip()

    if not (token and webhook_url and webhook_secret and repos_raw):
        return None

    events_raw = os.getenv("GITHUB_WEBHOOK_EVENTS", "").strip()
    events = tuple(_split_csv(events_raw) if events_raw else ["push", "pull_request"])
    repos = tuple(_split_csv(repos_raw))
    api_base_url = os.getenv("GITHUB_API_BASE_URL", "https://api.github.com").strip()
    insecure_ssl = os.getenv("GITHUB_WEBHOOK_INSECURE_SSL", "0").strip() or "0"
    content_type = os.getenv("GITHUB_WEBHOOK_CONTENT_TYPE", "json").strip() or "json"

    return GitHubWebhookSettings(
        token=token,
        webhook_url=webhook_url,
        webhook_secret=webhook_secret,
        repos=repos,
        events=events,
        api_base_url=api_base_url,
        content_type=content_type,
        insecure_ssl=insecure_ssl,
    )


class GitHubWebhookRegistrationError(RuntimeError):
    pass


async def _gh_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    json: Optional[Dict[str, Any]] = None,
) -> Any:
    resp = await client.request(method, url, json=json)
    if resp.status_code >= 400:
        raise GitHubWebhookRegistrationError(
            f"GitHub API error {resp.status_code} for {method} {url}: {resp.text}"
        )
    if resp.status_code == 204:
        return None
    return resp.json()


def _parse_owner_repo(full_name: str) -> Tuple[str, str]:
    if "/" not in full_name:
        raise ValueError(f"Invalid repo '{full_name}', expected 'owner/repo'")
    owner, repo = full_name.split("/", 1)
    owner = owner.strip()
    repo = repo.strip()
    if not owner or not repo:
        raise ValueError(f"Invalid repo '{full_name}', expected 'owner/repo'")
    return owner, repo


def _desired_hook_payload(settings: GitHubWebhookSettings) -> Dict[str, Any]:
    # https://docs.github.com/en/rest/webhooks/repos?apiVersion=2022-11-28#create-a-repository-webhook
    return {
        "name": "web",
        "active": True,
        "events": list(settings.events),
        "config": {
            "url": settings.webhook_url,
            "content_type": settings.content_type,
            "secret": settings.webhook_secret,
            "insecure_ssl": settings.insecure_ssl,
        },
    }


async def ensure_webhook_for_repo(
    client: httpx.AsyncClient,
    settings: GitHubWebhookSettings,
    full_name: str,
) -> Dict[str, Any]:
    owner, repo = _parse_owner_repo(full_name)
    hooks_url = f"{settings.api_base_url}/repos/{owner}/{repo}/hooks"
    hooks = await _gh_json(client, "GET", hooks_url)

    desired = _desired_hook_payload(settings)
    for hook in hooks or []:
        cfg = hook.get("config") or {}
        if (cfg.get("url") or "").rstrip("/") == settings.webhook_url.rstrip("/"):
            hook_id = hook.get("id")
            patch_url = f"{settings.api_base_url}/repos/{owner}/{repo}/hooks/{hook_id}"
            await _gh_json(client, "PATCH", patch_url, json=desired)
            return {"repo": full_name, "action": "updated", "hook_id": hook_id}

    created = await _gh_json(client, "POST", hooks_url, json=desired)
    return {"repo": full_name, "action": "created", "hook_id": created.get("id")}


async def ensure_webhooks_registered(
    settings: GitHubWebhookSettings,
) -> List[Dict[str, Any]]:
    """
    Ensures webhook exists for each repo in settings.repos.
    Returns a list of per-repo results: {repo, action, hook_id}.
    """
    headers = {
        "Authorization": f"Bearer {settings.token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aaiaas-webhook-registrar",
    }
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(headers=headers, timeout=timeout) as client:
        results: List[Dict[str, Any]] = []
        for repo in settings.repos:
            results.append(await ensure_webhook_for_repo(client, settings, repo))
        return results

