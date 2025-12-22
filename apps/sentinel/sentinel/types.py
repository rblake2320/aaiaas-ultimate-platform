from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Literal, Optional


CheckStatus = Literal["pass", "fail", "skip", "error"]
Severity = Literal["info", "warning", "error"]


@dataclass(frozen=True)
class Check:
    id: str
    name: str
    command: str
    cwd: str = "."
    timeout_sec: int = 900
    required_tools: list[str] = field(default_factory=list)


@dataclass
class CheckResult:
    id: str
    name: str
    command: str
    cwd: str
    timeout_sec: int
    required_tools: list[str]
    status: CheckStatus
    exit_code: Optional[int] = None
    duration_ms: int = 0
    stdout: str = ""
    stderr: str = ""
    skipped_reason: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Finding:
    severity: Severity
    tool: str
    message: str
    check_id: str
    file: Optional[str] = None
    line: Optional[int] = None
    col: Optional[int] = None
    code: Optional[str] = None
    raw: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Report:
    version: int
    created_at: str
    workspace_root: str
    git: dict[str, Any]
    checks: list[CheckResult]
    findings: list[Finding]
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "created_at": self.created_at,
            "workspace_root": self.workspace_root,
            "git": self.git,
            "checks": [c.to_dict() for c in self.checks],
            "findings": [f.to_dict() for f in self.findings],
            "metadata": self.metadata,
        }

