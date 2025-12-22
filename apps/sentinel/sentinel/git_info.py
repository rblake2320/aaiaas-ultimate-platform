from __future__ import annotations

from pathlib import Path

from .runner import run_cmd, which


def get_git_info(workspace_root: str | Path) -> dict:
    if not which("git"):
        return {"available": False}

    root = Path(workspace_root)
    head = run_cmd("git rev-parse HEAD", cwd=root, timeout_sec=10)
    branch = run_cmd("git rev-parse --abbrev-ref HEAD", cwd=root, timeout_sec=10)
    dirty = run_cmd("git status --porcelain", cwd=root, timeout_sec=10)

    return {
        "available": True,
        "sha": (head.stdout or "").strip() if head.exit_code == 0 else None,
        "branch": (branch.stdout or "").strip() if branch.exit_code == 0 else None,
        "dirty": bool((dirty.stdout or "").strip()) if dirty.exit_code == 0 else None,
    }

