from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from .io_utils import write_text


@dataclass(frozen=True)
class PatchProposal:
    ok: bool
    patch_text: str
    provider: str
    model: Optional[str] = None
    error: Optional[str] = None


def propose_patches(
    *,
    report: dict[str, Any],
    provider: str,
    model: Optional[str],
    out_dir: Path,
) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    created = []

    if provider in {"none", "noop"}:
        created.append(_write_plan(report=report, out_dir=out_dir))
        return created

    if provider == "api-ai":
        proposal = _api_ai_patch(report=report, model=model)
        created.append(_write_patch(proposal=proposal, out_dir=out_dir))
        return created

    raise ValueError(f"Unknown provider: {provider}")


def _write_plan(*, report: dict[str, Any], out_dir: Path) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    p = out_dir / f"plan-{ts}.md"

    checks = report.get("checks", []) or []
    failed = [c for c in checks if c.get("status") in {"fail", "error"}]
    skipped = [c for c in checks if c.get("status") == "skip"]
    findings = report.get("findings", []) or []

    lines = []
    lines.append("# Sentinel plan\n")
    lines.append("## Summary\n")
    lines.append(f"- Checks: {len(checks)} total, {len(failed)} failed, {len(skipped)} skipped\n")
    lines.append(f"- Findings: {len(findings)} parsed\n")
    lines.append("\n## Next actions\n")
    if failed:
        lines.append("1. Re-run failing checks locally to reproduce:\n")
        for c in failed[:10]:
            lines.append(f"   - `{c.get('command')}` (cwd: `{c.get('cwd')}`)\n")
    else:
        lines.append("1. No failing checks detected in this report.\n")

    if findings:
        lines.append("\n2. Start with the top findings (most specific file/line):\n")
        top = [f for f in findings if f.get("file")][:15]
        for f in top:
            loc = f"{f.get('file')}:{f.get('line')}"
            if f.get("col") is not None:
                loc += f":{f.get('col')}"
            lines.append(f"   - **{f.get('tool')}** at `{loc}`: {f.get('message')}\n")

    write_text(p, "".join(lines))
    return p


def _api_ai_patch(*, report: dict[str, Any], model: Optional[str]) -> PatchProposal:
    """
    Calls the `apps/api-ai` chat endpoint (which then calls OpenAI).

    Required env:
      - SENTINEL_API_AI_URL (default http://localhost:5000/api/v1/chat)
      - SENTINEL_API_AI_KEY (sent as Authorization: Bearer ...)
    """
    try:
        import httpx  # type: ignore
    except Exception:  # noqa: BLE001
        return PatchProposal(ok=False, patch_text="", provider="api-ai", model=model, error="Missing dependency: httpx")

    url = os.getenv("SENTINEL_API_AI_URL", "http://localhost:5000/api/v1/chat")
    key = os.getenv("SENTINEL_API_AI_KEY")
    if not key:
        return PatchProposal(ok=False, patch_text="", provider="api-ai", model=model, error="Missing SENTINEL_API_AI_KEY")

    # Keep prompt small: only include failed checks + a subset of findings.
    checks = report.get("checks", []) or []
    failed = [c for c in checks if c.get("status") in {"fail", "error"}]
    findings = report.get("findings", []) or []

    context = {
        "git": report.get("git"),
        "failed_checks": [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "command": c.get("command"),
                "cwd": c.get("cwd"),
                "exit_code": c.get("exit_code"),
                "stderr": (c.get("stderr") or "")[-8000:],
                "stdout": (c.get("stdout") or "")[-8000:],
            }
            for c in failed[:5]
        ],
        "findings": findings[:50],
    }

    system = (
        "You are The Sentinel, an autonomous issue fixer for a git repository. "
        "You will be given failing check output and structured findings.\n\n"
        "Return ONLY a unified diff patch (git apply compatible). "
        "If you cannot propose a safe patch, return an empty diff.\n"
    )
    user = (
        "Generate a minimal patch that fixes the failures. "
        "Prefer small, safe changes. Do not change unrelated files.\n\n"
        f"Context JSON:\n{context}\n"
    )

    headers = {"Authorization": f"Bearer {key}"}
    payload = {
        "model": model or "gpt-4.1-mini",
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    try:
        resp = httpx.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        content = (((data or {}).get("message") or {}).get("content") or "").strip()
        return PatchProposal(ok=True, patch_text=content, provider="api-ai", model=payload["model"])
    except Exception as e:  # noqa: BLE001
        return PatchProposal(ok=False, patch_text="", provider="api-ai", model=payload["model"], error=str(e))


def _write_patch(*, proposal: PatchProposal, out_dir: Path) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = "diff" if proposal.ok and proposal.patch_text.strip() else "txt"
    p = out_dir / f"patch-{proposal.provider}-{ts}.{suffix}"

    if not proposal.ok:
        write_text(
            p,
            f"# Sentinel patch generation failed\n\n- provider: {proposal.provider}\n- model: {proposal.model}\n- error: {proposal.error}\n",
        )
        return p

    if not proposal.patch_text.strip():
        write_text(
            p,
            f"# Sentinel produced no patch\n\n- provider: {proposal.provider}\n- model: {proposal.model}\n",
        )
        return p

    write_text(p, proposal.patch_text.rstrip() + "\n")
    return p

