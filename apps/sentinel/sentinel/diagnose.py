from __future__ import annotations

import re
from typing import Iterable

from .types import Finding, CheckResult


_RE_FLAKE8 = re.compile(r"^(?P<file>[^:]+):(?P<line>\d+):(?P<col>\d+): (?P<code>[A-Z]\d+)\s+(?P<msg>.+)$")
_RE_MYPY = re.compile(r"^(?P<file>[^:]+):(?P<line>\d+): (?P<sev>error|note): (?P<msg>.+)$")
_RE_TSC = re.compile(r"^(?P<file>[^\\s].*?)\\((?P<line>\\d+),(?P<col>\\d+)\\): error (?P<code>TS\\d+): (?P<msg>.+)$")
_RE_ESLINT = re.compile(r"^(?P<file>[^\\s].*?):(?P<line>\\d+):(?P<col>\\d+): (?P<msg>.+?)\\s{2,}(?P<code>[^\\s]+)$")
_RE_PYTEST_FILELINE = re.compile(r"^(?P<file>[^\\s].*?):(?P<line>\\d+): (?P<msg>.+)$")


def _iter_lines(*chunks: str) -> Iterable[str]:
    for chunk in chunks:
        if not chunk:
            continue
        for line in chunk.splitlines():
            yield line.rstrip("\n")


def extract_findings(check: CheckResult) -> list[Finding]:
    """
    Best-effort parsing of common tool outputs into structured findings.

    This is intentionally heuristic (fast + robust), not a full parser.
    """
    findings: list[Finding] = []
    tool_guess = _guess_tool(check)

    for line in _iter_lines(check.stdout, check.stderr):
        if not line.strip():
            continue

        m = _RE_FLAKE8.match(line)
        if m:
            findings.append(
                Finding(
                    severity="error",
                    tool=tool_guess or "flake8",
                    message=m.group("msg"),
                    check_id=check.id,
                    file=m.group("file"),
                    line=int(m.group("line")),
                    col=int(m.group("col")),
                    code=m.group("code"),
                    raw=line,
                )
            )
            continue

        m = _RE_MYPY.match(line)
        if m:
            findings.append(
                Finding(
                    severity="error" if m.group("sev") == "error" else "info",
                    tool=tool_guess or "mypy",
                    message=m.group("msg"),
                    check_id=check.id,
                    file=m.group("file"),
                    line=int(m.group("line")),
                    raw=line,
                )
            )
            continue

        m = _RE_TSC.match(line)
        if m:
            findings.append(
                Finding(
                    severity="error",
                    tool=tool_guess or "tsc",
                    message=m.group("msg"),
                    check_id=check.id,
                    file=m.group("file"),
                    line=int(m.group("line")),
                    col=int(m.group("col")),
                    code=m.group("code"),
                    raw=line,
                )
            )
            continue

        m = _RE_ESLINT.match(line)
        if m:
            findings.append(
                Finding(
                    severity="error",
                    tool=tool_guess or "eslint",
                    message=m.group("msg"),
                    check_id=check.id,
                    file=m.group("file"),
                    line=int(m.group("line")),
                    col=int(m.group("col")),
                    code=m.group("code"),
                    raw=line,
                )
            )
            continue

        # Common "path:line: ..." formats (pytest trace heads, node tooling, etc.)
        m = _RE_PYTEST_FILELINE.match(line)
        if m and ("/" in m.group("file") or m.group("file").endswith((".py", ".ts", ".tsx", ".js", ".jsx"))):
            findings.append(
                Finding(
                    severity="error",
                    tool=tool_guess or "unknown",
                    message=m.group("msg"),
                    check_id=check.id,
                    file=m.group("file"),
                    line=int(m.group("line")),
                    raw=line,
                )
            )
            continue

    # If the check failed but we couldn't parse anything, keep a summary finding.
    if check.status in {"fail", "error"} and not findings:
        summary = (check.stderr or check.stdout or "").strip().splitlines()
        msg = summary[0].strip() if summary else "Check failed without output"
        findings.append(
            Finding(
                severity="error",
                tool=tool_guess or "unknown",
                message=msg[:400],
                check_id=check.id,
                raw=msg[:2000] if msg else None,
            )
        )

    return findings


def _guess_tool(check: CheckResult) -> str | None:
    cmd = check.command.lower()
    if "flake8" in cmd:
        return "flake8"
    if "mypy" in cmd:
        return "mypy"
    if "pytest" in cmd:
        return "pytest"
    if "eslint" in cmd:
        return "eslint"
    if "tsc" in cmd or "type-check" in cmd:
        return "tsc"
    if "jest" in cmd:
        return "jest"
    if "next lint" in cmd:
        return "eslint"
    if "compileall" in cmd or "py_compile" in cmd:
        return "python"
    return None

