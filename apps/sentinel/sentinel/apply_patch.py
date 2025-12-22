from __future__ import annotations

from pathlib import Path

from .runner import run_cmd, which


def apply_diff(diff_path: str | Path, *, workspace_root: str | Path = ".", check_only: bool = False) -> dict:
    """
    Applies a unified diff via `git apply`.
    """
    if not which("git"):
        return {"ok": False, "error": "git not found"}

    root = Path(workspace_root).resolve()
    p = Path(diff_path)
    if not p.exists():
        return {"ok": False, "error": f"diff not found: {p}"}

    check = run_cmd(f'git apply --check "{p}"', cwd=root, timeout_sec=30)
    if check.exit_code != 0:
        return {"ok": False, "error": "git apply --check failed", "stderr": check.stderr, "stdout": check.stdout}

    if check_only:
        return {"ok": True, "checked": True}

    apply = run_cmd(f'git apply "{p}"', cwd=root, timeout_sec=30)
    if apply.exit_code != 0:
        return {"ok": False, "error": "git apply failed", "stderr": apply.stderr, "stdout": apply.stdout}

    return {"ok": True}

