from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

from .apply_patch import apply_diff
from .config import SentinelConfig
from .github import list_failed_runs, list_issues
from .io_utils import read_json, write_json
from .propose import propose_patches
from .scan import run_scan


console = Console()


def main(argv: list[str] | None = None) -> int:
    argv = _normalize_argv(argv)
    parser = argparse.ArgumentParser(prog="sentinel", description="The Sentinel - autonomous issue detection & resolution")
    parser.add_argument("--config", default=".sentinel.yml", help="Path to Sentinel config YAML")

    sub = parser.add_subparsers(dest="cmd", required=True)

    p_scan = sub.add_parser("scan", help="Run configured checks and write a report")
    p_scan.add_argument("--only", action="append", default=[], help="Only run checks with this id (repeatable)")
    p_scan.add_argument("--out", default="", help="Optional explicit report output path")
    p_scan.add_argument(
        "--exit-zero",
        action="store_true",
        help="Always exit 0 (even if checks fail). Useful for non-blocking CI intake.",
    )

    p_diag = sub.add_parser("diagnose", help="Summarize a report and emit diagnosis JSON")
    p_diag.add_argument("report", help="Path to report JSON")
    p_diag.add_argument("--out", default="", help="Optional output path for diagnosis JSON")

    p_prop = sub.add_parser("propose", help="Create a plan or patch set from a report")
    p_prop.add_argument("report", help="Path to report JSON")
    p_prop.add_argument("--provider", default="none", choices=["none", "noop", "api-ai"], help="Patch provider")
    p_prop.add_argument("--model", default="", help="Model name (provider dependent)")

    p_apply = sub.add_parser("apply", help="Apply a unified diff (git apply)")
    p_apply.add_argument("diff", help="Path to .diff file")
    p_apply.add_argument("--check", action="store_true", help="Only validate patch applies cleanly")

    p_gh = sub.add_parser("gh", help="GitHub intake via gh")
    gh_sub = p_gh.add_subparsers(dest="gh_cmd", required=True)
    p_gh_runs = gh_sub.add_parser("failed-runs", help="List failed GitHub Actions runs")
    p_gh_runs.add_argument("--limit", type=int, default=20)
    p_gh_runs.add_argument("--branch", default="", help="Filter to a branch")
    p_gh_issues = gh_sub.add_parser("issues", help="List issues for a label")
    p_gh_issues.add_argument("--label", default="sentinel")
    p_gh_issues.add_argument("--state", default="open")
    p_gh_issues.add_argument("--limit", type=int, default=30)

    args = parser.parse_args(argv)

    if args.cmd == "scan":
        config = SentinelConfig.load(args.config)
        report_path, failed = run_scan(
            config,
            config_path=args.config,
            only=args.only or None,
            out_path=args.out or None,
        )
        console.print(f"[bold green]Report written:[/bold green] {report_path}")
        if failed and not args.exit_zero:
            return 1
        return 0

    if args.cmd == "diagnose":
        report = read_json(args.report)
        diagnosis = build_diagnosis(report)
        out = args.out or str(Path(args.report).with_name(Path(args.report).stem + ".diagnosis.json"))
        write_json(out, diagnosis)
        render_diagnosis(diagnosis)
        console.print(f"[bold green]Diagnosis written:[/bold green] {out}")
        return 0

    if args.cmd == "propose":
        report = read_json(args.report)
        config = SentinelConfig.load(args.config)
        out_dir = Path(config.workspace_root).resolve() / config.patches_dir
        created = propose_patches(
            report=report,
            provider=args.provider,
            model=args.model or None,
            out_dir=out_dir,
        )
        for p in created:
            console.print(f"[bold green]Created:[/bold green] {p}")
        return 0

    if args.cmd == "apply":
        config = SentinelConfig.load(args.config)
        res = apply_diff(args.diff, workspace_root=config.workspace_root, check_only=bool(args.check))
        if res.get("ok"):
            console.print("[bold green]Patch OK[/bold green]" if args.check else "[bold green]Patch applied[/bold green]")
            return 0
        console.print("[bold red]Patch failed[/bold red]")
        console.print(res)
        return 2

    if args.cmd == "gh":
        if args.gh_cmd == "failed-runs":
            r = list_failed_runs(limit=args.limit, branch=args.branch or None)
            if not r.ok:
                console.print("[bold red]gh failed[/bold red]")
                console.print(r.stderr)
                return 2
            render_failed_runs(r.data or [])
            return 0
        if args.gh_cmd == "issues":
            r = list_issues(label=args.label, state=args.state, limit=args.limit)
            if not r.ok:
                console.print("[bold red]gh failed[/bold red]")
                console.print(r.stderr)
                return 2
            render_issues(r.data or [])
            return 0

    console.print("[bold red]Unknown command[/bold red]")
    return 2


def _normalize_argv(argv: list[str] | None) -> list[str]:
    """
    Allows `--config` to appear either before or after the subcommand.

    Examples:
      - sentinel --config .sentinel.yml scan
      - sentinel scan --config .sentinel.yml
    """
    if argv is None:
        argv = sys.argv[1:]

    cmds = {"scan", "diagnose", "propose", "apply", "gh"}
    cmd_idx = next((i for i, a in enumerate(argv) if a in cmds), None)
    if cmd_idx is None:
        return argv

    if "--config" in argv:
        i = argv.index("--config")
        if i > cmd_idx and i + 1 < len(argv):
            val = argv[i + 1]
            rest = argv[:i] + argv[i + 2 :]
            return ["--config", val] + rest

    # Support --config=path
    for i, a in enumerate(argv):
        if a.startswith("--config=") and i > cmd_idx:
            rest = argv[:i] + argv[i + 1 :]
            return [a] + rest

    return argv


def build_diagnosis(report: dict) -> dict:
    checks = report.get("checks", []) or []
    findings = report.get("findings", []) or []
    failed = [c for c in checks if c.get("status") in {"fail", "error"}]
    skipped = [c for c in checks if c.get("status") == "skip"]

    # Rank findings: prefer file/line, then severity.
    def score(f: dict) -> tuple:
        sev = f.get("severity")
        sev_score = {"error": 2, "warning": 1, "info": 0}.get(sev, 0)
        has_loc = 1 if f.get("file") else 0
        return (-sev_score, -has_loc)

    top_findings = sorted(findings, key=score)[:50]
    files = {}
    for f in findings:
        fp = f.get("file")
        if not fp:
            continue
        files.setdefault(fp, 0)
        files[fp] += 1

    return {
        "created_at": report.get("created_at"),
        "git": report.get("git"),
        "summary": {
            "checks_total": len(checks),
            "checks_failed": len(failed),
            "checks_skipped": len(skipped),
            "findings_total": len(findings),
        },
        "failed_checks": failed,
        "top_findings": top_findings,
        "files_most_mentioned": sorted(
            [{"file": k, "count": v} for k, v in files.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:20],
    }


def render_diagnosis(d: dict) -> None:
    s = d.get("summary") or {}
    console.print(
        f"[bold]Checks[/bold]: {s.get('checks_total')} total, "
        f"[bold red]{s.get('checks_failed')} failed[/bold red], "
        f"[yellow]{s.get('checks_skipped')} skipped[/yellow] | "
        f"[bold]Findings[/bold]: {s.get('findings_total')}"
    )

    failed = d.get("failed_checks") or []
    if failed:
        t = Table(title="Failed checks", show_lines=True)
        t.add_column("id", style="bold")
        t.add_column("command")
        t.add_column("cwd")
        t.add_column("exit")
        for c in failed[:20]:
            t.add_row(str(c.get("id")), str(c.get("command")), str(c.get("cwd")), str(c.get("exit_code")))
        console.print(t)

    top = d.get("top_findings") or []
    if top:
        t = Table(title="Top findings", show_lines=True)
        t.add_column("sev")
        t.add_column("tool")
        t.add_column("location")
        t.add_column("message")
        for f in top[:20]:
            loc = ""
            if f.get("file"):
                loc = f"{f.get('file')}:{f.get('line')}"
                if f.get("col") is not None:
                    loc += f":{f.get('col')}"
            t.add_row(str(f.get("severity")), str(f.get("tool")), loc, str(f.get("message"))[:140])
        console.print(t)


def render_failed_runs(runs: list[dict]) -> None:
    t = Table(title="Failed GitHub Actions runs", show_lines=True)
    t.add_column("id", style="bold")
    t.add_column("title")
    t.add_column("branch")
    t.add_column("conclusion")
    t.add_column("url")
    for r in runs[:30]:
        t.add_row(
            str(r.get("databaseId")),
            str(r.get("displayTitle")),
            str(r.get("headBranch")),
            str(r.get("conclusion")),
            str(r.get("htmlUrl")),
        )
    console.print(t)


def render_issues(issues: list[dict]) -> None:
    t = Table(title="GitHub issues", show_lines=True)
    t.add_column("#", style="bold")
    t.add_column("title")
    t.add_column("state")
    t.add_column("url")
    for i in issues[:50]:
        t.add_row(str(i.get("number")), str(i.get("title")), str(i.get("state")), str(i.get("url")))
    console.print(t)

