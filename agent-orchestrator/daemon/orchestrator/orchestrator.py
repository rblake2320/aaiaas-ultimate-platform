from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass

from orchestrator.agents.base import Agent, AgentContext
from orchestrator.agents.noop import NoopAgent
from orchestrator.config import RuntimeState, Settings
from orchestrator.db.work_items import WorkItemStore
from orchestrator.repos.base import RepoMonitor
from orchestrator.repos.github import GitHubRepoMonitor
from orchestrator.repos.local import LocalRepoMonitor


@dataclass
class OrchestratorDeps:
    settings: Settings
    store: WorkItemStore
    monitors: list[RepoMonitor]
    agents: list[Agent]


def build_default_deps(settings: Settings) -> OrchestratorDeps:
    monitors: list[RepoMonitor] = []
    for r in settings.parsed_repos():
        if r.type == "local":
            if not r.path:
                raise ValueError(f"local repo '{r.name}' missing path")
            monitors.append(LocalRepoMonitor(name=r.name, path=r.path))
        elif r.type == "github":
            if not (r.owner and r.repo):
                raise ValueError(f"github repo '{r.name}' missing owner/repo")
            monitors.append(
                GitHubRepoMonitor(
                    name=r.name,
                    owner=r.owner,
                    repo=r.repo,
                    default_branch=(r.default_branch or "main"),
                )
            )
        else:
            raise ValueError(f"unknown repo type: {r.type}")

    agents: list[Agent] = [NoopAgent()]
    store = WorkItemStore(settings.db_path)
    return OrchestratorDeps(settings=settings, store=store, monitors=monitors, agents=agents)


class Orchestrator:
    def __init__(self, deps: OrchestratorDeps) -> None:
        self._deps = deps
        self._state = RuntimeState(started_at_unix=time.time())
        self._stop = asyncio.Event()
        self._trigger_scan = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    @property
    def state(self) -> RuntimeState:
        return self._state

    @property
    def store(self) -> WorkItemStore:
        return self._deps.store

    def trigger_scan(self) -> None:
        self._trigger_scan.set()

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run_loop(), name="agent-orchestrator-loop")

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task

    async def scan_once(self) -> dict[str, object]:
        snapshots = []
        issues_enqueued = 0

        for m in self._deps.monitors:
            snap = await m.snapshot()
            snapshots.append(
                {
                    "repo_name": snap.repo_name,
                    "kind": snap.kind,
                    "default_branch": snap.default_branch,
                    "head_sha": snap.head_sha,
                    "metadata": snap.metadata,
                }
            )
            dedupe_key = f"scan:{snap.repo_name}:{snap.head_sha or 'unknown'}"
            self._deps.store.enqueue(
                repo_name=snap.repo_name,
                type="repo_scan",
                title=f"Repo scan: {snap.repo_name}@{(snap.head_sha or 'unknown')[:12]}",
                payload_json=json.dumps({"snapshot": snapshots[-1]}),
                dedupe_key=dedupe_key,
            )

            for issue in await m.list_open_issues(limit=20):
                number = issue.get("number")
                if number is None:
                    continue
                title = str(issue.get("title") or f"Issue #{number}")
                body = str(issue.get("body") or "")
                html_url = str(issue.get("html_url") or "")
                labels = []
                raw_labels = issue.get("labels")
                if isinstance(raw_labels, list):
                    for l in raw_labels:
                        if isinstance(l, dict) and "name" in l:
                            labels.append(str(l["name"]))
                issue_key = f"issue:{snap.repo_name}:{number}"
                before = self._deps.store.enqueue(
                    repo_name=snap.repo_name,
                    type="github_issue",
                    title=f"[#{number}] {title}",
                    payload_json=json.dumps(
                        {
                            "number": number,
                            "title": title,
                            "body": body,
                            "html_url": html_url,
                            "labels": labels,
                            "repo": {"name": snap.repo_name, "kind": snap.kind},
                        }
                    ),
                    dedupe_key=issue_key,
                )
                if before > 0:
                    issues_enqueued += 1

        summary = {"repos": len(self._deps.monitors), "snapshots": snapshots, "issues_enqueued": issues_enqueued}
        self._state.last_scan_at_unix = time.time()
        self._state.last_scan_summary = summary
        return summary

    async def _run_loop(self) -> None:
        interval = max(5, int(self._deps.settings.poll_interval_seconds))

        while not self._stop.is_set():
            try:
                # Scan cycle: either periodic or forced
                forced = self._trigger_scan.is_set()
                if forced:
                    self._trigger_scan.clear()

                await self.scan_once()
                await self._process_work_items(max_items=3)

                # Wait, but allow immediate trigger
                try:
                    await asyncio.wait_for(self._trigger_scan.wait(), timeout=interval)
                except asyncio.TimeoutError:
                    pass
            except Exception as e:  # keep daemon alive
                self._state.last_scan_summary = {
                    "error": str(e),
                    "at_unix": time.time(),
                }
                await asyncio.sleep(2)

    async def _process_work_items(self, max_items: int = 3) -> None:
        monitors_by_repo = {m.repo_name: m for m in self._deps.monitors}
        ctx = AgentContext(settings=self._deps.settings, monitors_by_repo=monitors_by_repo)

        processed = 0
        while processed < max_items:
            item = self._deps.store.claim_next()
            if item is None:
                return

            agent = next((a for a in self._deps.agents if a.can_handle(item)), None)
            if agent is None:
                self._deps.store.mark_done(item.id, status="skipped", error="no agent available")
                processed += 1
                continue

            try:
                res = await agent.run(ctx, item)
                self._deps.store.mark_done(item.id, status=res.outcome, error=None if res.outcome != "failed" else res.message)
            except Exception as e:
                self._deps.store.mark_done(item.id, status="failed", error=str(e))
            processed += 1

