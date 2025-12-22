"""
GitHub webhook receiver + signature verification.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, Header, HTTPException, Request


router = APIRouter(tags=["github"])


def compute_github_signature_256(body: bytes, secret: str) -> str:
    mac = hmac.new(secret.encode("utf-8"), msg=body, digestmod=hashlib.sha256)
    return f"sha256={mac.hexdigest()}"


def is_valid_github_signature(
    body: bytes,
    signature_header: Optional[str],
    secret: str,
) -> bool:
    if not signature_header:
        return False
    expected = compute_github_signature_256(body, secret)
    # constant-time compare
    return hmac.compare_digest(signature_header, expected)


def _load_allowed_repos_from_env() -> Set[str]:
    raw = os.getenv("GITHUB_WEBHOOK_REPOS", "").strip()
    if not raw:
        return set()
    parts = []
    for tok in raw.replace("\n", ",").replace(" ", ",").split(","):
        v = tok.strip()
        if v:
            parts.append(v)
    # Normalize to "owner/repo"
    return {p for p in parts if "/" in p}


def _repo_full_name_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    repo = payload.get("repository") if isinstance(payload, dict) else None
    if isinstance(repo, dict):
        full_name = repo.get("full_name")
        if isinstance(full_name, str) and full_name.strip():
            return full_name.strip()
    return None


@router.post("/webhook")
async def github_webhook(
    request: Request,
    x_github_event: Optional[str] = Header(default=None, alias="X-GitHub-Event"),
    x_github_delivery: Optional[str] = Header(default=None, alias="X-GitHub-Delivery"),
    x_hub_signature_256: Optional[str] = Header(default=None, alias="X-Hub-Signature-256"),
):
    body = await request.body()

    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").strip()
    require_sig = os.getenv("GITHUB_WEBHOOK_REQUIRE_SIGNATURE", "true").lower() in {
        "1",
        "true",
        "yes",
    }
    if require_sig:
        if not secret:
            raise HTTPException(status_code=500, detail="Webhook secret not configured")
        if not is_valid_github_signature(body, x_hub_signature_256, secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    allowed = _load_allowed_repos_from_env()
    repo_full_name = _repo_full_name_from_payload(payload)
    if allowed and repo_full_name and repo_full_name not in allowed:
        raise HTTPException(status_code=403, detail="Repo not allowed")

    # Handle ping event (GitHub sends this on creation)
    if x_github_event == "ping":
        return {"ok": True, "event": "ping"}

    # For now, we just acknowledge. Downstream automation can be added later.
    return {
        "ok": True,
        "event": x_github_event,
        "delivery": x_github_delivery,
        "repo": repo_full_name,
    }

