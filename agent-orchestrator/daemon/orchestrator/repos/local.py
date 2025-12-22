from __future__ import annotations

from dataclasses import dataclass
from orchestrator.repos.base import RepoMonitor, RepoSnapshot
from orchestrator.utils.subprocesses import run_cmd


@dataclass(frozen=True)
class LocalRepoMonitor(RepoMonitor):
    name: str
    path: str

    @property
    def repo_name(self) -> str:
        return self.name

    async def snapshot(self) -> RepoSnapshot:
        head = await run_cmd(["git", "rev-parse", "HEAD"], cwd=self.path, timeout_seconds=30)
        branch = await run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=self.path, timeout_seconds=30)
        status = await run_cmd(["git", "status", "--porcelain"], cwd=self.path, timeout_seconds=30)

        head_sha = head.stdout.strip() if head.returncode == 0 else None
        current_branch = branch.stdout.strip() if branch.returncode == 0 else None
        dirty = bool(status.stdout.strip()) if status.returncode == 0 else None

        return RepoSnapshot(
            repo_name=self.name,
            kind="local",
            default_branch=current_branch,
            head_sha=head_sha,
            metadata={
                "path": self.path,
                "current_branch": current_branch,
                "dirty": dirty,
                "git_errors": {
                    "head": head.stderr.strip() if head.returncode != 0 else None,
                    "branch": branch.stderr.strip() if branch.returncode != 0 else None,
                    "status": status.stderr.strip() if status.returncode != 0 else None,
                },
            },
        )

