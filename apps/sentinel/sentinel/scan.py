from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from .config import SentinelConfig
from .diagnose import extract_findings
from .git_info import get_git_info
from .io_utils import write_json
from .runner import run_cmd, which
from .types import CheckResult, Report


def run_scan(
    config: SentinelConfig,
    *,
    config_path: str,
    only: list[str] | None = None,
    out_path: str | None = None,
) -> tuple[Path, int]:
    root = Path(config.workspace_root).resolve()
    created_at = datetime.now(timezone.utc).isoformat()

    results: list[CheckResult] = []
    findings = []

    for check in config.checks:
        if only and check.id not in set(only):
            continue

        missing = [t for t in check.required_tools if not which(t)]
        if missing:
            results.append(
                CheckResult(
                    id=check.id,
                    name=check.name,
                    command=check.command,
                    cwd=check.cwd,
                    timeout_sec=check.timeout_sec,
                    required_tools=check.required_tools,
                    status="skip",
                    skipped_reason=f"Missing tools: {', '.join(missing)}",
                )
            )
            continue

        try:
            r = run_cmd(check.command, cwd=root / check.cwd, timeout_sec=check.timeout_sec)
            status = "pass" if r.exit_code == 0 else "fail"
            cr = CheckResult(
                id=check.id,
                name=check.name,
                command=check.command,
                cwd=check.cwd,
                timeout_sec=check.timeout_sec,
                required_tools=check.required_tools,
                status=status,
                exit_code=r.exit_code,
                duration_ms=r.duration_ms,
                stdout=r.stdout,
                stderr=r.stderr,
                skipped_reason=None,
                error=None,
            )
            results.append(cr)
            findings.extend(extract_findings(cr))
        except Exception as e:  # noqa: BLE001
            cr = CheckResult(
                id=check.id,
                name=check.name,
                command=check.command,
                cwd=check.cwd,
                timeout_sec=check.timeout_sec,
                required_tools=check.required_tools,
                status="error",
                error=str(e),
            )
            results.append(cr)
            findings.extend(extract_findings(cr))

    report = Report(
        version=config.version,
        created_at=created_at,
        workspace_root=str(root),
        git=get_git_info(root),
        checks=results,
        findings=findings,
        metadata={
            "config_path": config_path,
            "checks_total": len(config.checks),
            "checks_run": len(results),
        },
    )

    resolved_out: Path
    if out_path:
        resolved_out = (root / out_path) if not Path(out_path).is_absolute() else Path(out_path)
    else:
        out_dir = root / config.reports_dir
        resolved_out = out_dir / f"report-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.json"

    write_json(resolved_out, report.to_dict())

    failed_count = sum(1 for c in results if c.status in {"fail", "error"})
    return resolved_out, failed_count

