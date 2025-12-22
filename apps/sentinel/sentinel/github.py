from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from .runner import run_cmd, which


@dataclass(frozen=True)
class GhResult:
    ok: bool
    data: Any
    stderr: str = ""
    exit_code: int = 0


def gh_available() -> bool:
    return which("gh") is not None


def gh_json(args: str, *, cwd: str | Path = ".", timeout_sec: int = 30) -> GhResult:
    """
    Run `gh` and parse JSON output.

    Args:
        args: arguments after `gh`, e.g. `issue list --json number,title`.
    """
    if not gh_available():
        return GhResult(ok=False, data={"error": "gh not found"}, stderr="gh not found", exit_code=127)

    r = run_cmd(f"gh {args}", cwd=cwd, timeout_sec=timeout_sec)
    if r.exit_code != 0:
        return GhResult(ok=False, data={"error": "gh failed"}, stderr=r.stderr, exit_code=r.exit_code)

    out = (r.stdout or "").strip()
    if not out:
        return GhResult(ok=True, data=None, stderr=r.stderr, exit_code=0)

    try:
        return GhResult(ok=True, data=json.loads(out), stderr=r.stderr, exit_code=0)
    except Exception:  # noqa: BLE001
        return GhResult(ok=False, data={"error": "invalid json", "raw": out[:5000]}, stderr=r.stderr, exit_code=1)


def list_failed_runs(*, limit: int = 20, branch: Optional[str] = None) -> GhResult:
    fields = "databaseId,conclusion,status,headBranch,headSha,displayTitle,createdAt,updatedAt,htmlUrl,event"
    cmd = f"run list --limit {int(limit)} --json {fields} --status completed"
    if branch:
        cmd += f" --branch {branch}"
    data = gh_json(cmd, timeout_sec=60)
    if not data.ok or not isinstance(data.data, list):
        return data
    failed = [r for r in data.data if r.get("conclusion") in {"failure", "cancelled", "timed_out", "action_required"}]
    return GhResult(ok=True, data=failed, stderr=data.stderr, exit_code=0)


def list_issues(*, label: str = "sentinel", state: str = "open", limit: int = 30) -> GhResult:
    fields = "number,title,state,labels,url,createdAt,updatedAt"
    cmd = f"issue list --state {state} --limit {int(limit)} --label {label} --json {fields}"
    return gh_json(cmd, timeout_sec=60)

