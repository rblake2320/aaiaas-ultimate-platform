from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .io_utils import read_yaml
from .types import Check


@dataclass
class SentinelConfig:
    version: int = 1
    workspace_root: str = "."
    reports_dir: str = ".sentinel/reports"
    patches_dir: str = ".sentinel/patches"
    checks: list[Check] = field(default_factory=list)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "SentinelConfig":
        version = int(data.get("version", 1))
        workspace_root = str(data.get("workspace_root", "."))
        reports_dir = str(data.get("reports_dir", ".sentinel/reports"))
        patches_dir = str(data.get("patches_dir", ".sentinel/patches"))
        checks_raw = data.get("checks", []) or []

        checks: list[Check] = []
        for c in checks_raw:
            if not isinstance(c, dict):
                continue
            checks.append(
                Check(
                    id=str(c["id"]),
                    name=str(c.get("name", c["id"])),
                    command=str(c["command"]),
                    cwd=str(c.get("cwd", ".")),
                    timeout_sec=int(c.get("timeout_sec", 900)),
                    required_tools=[str(x) for x in (c.get("required_tools", []) or [])],
                )
            )

        return SentinelConfig(
            version=version,
            workspace_root=workspace_root,
            reports_dir=reports_dir,
            patches_dir=patches_dir,
            checks=checks,
        )

    @staticmethod
    def load(path: str) -> "SentinelConfig":
        data = read_yaml(path)
        return SentinelConfig.from_dict(data)

    def abs_path(self, relative: str) -> Path:
        return Path(self.workspace_root).resolve() / relative

