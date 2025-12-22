"""
Manual webhook registrar.

Usage:
  cd apps/api-ai
  python scripts/register_github_webhooks.py

Requires env:
  GITHUB_TOKEN
  GITHUB_WEBHOOK_URL
  GITHUB_WEBHOOK_SECRET
  GITHUB_WEBHOOK_REPOS  (comma/space/newline separated owner/repo list)
Optional:
  GITHUB_WEBHOOK_EVENTS (comma/space/newline separated, default: push,pull_request)
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path


# Ensure `apps/api-ai` is on sys.path so `import services.*` works.
API_AI_DIR = Path(__file__).resolve().parents[1]
if str(API_AI_DIR) not in sys.path:
    sys.path.insert(0, str(API_AI_DIR))


from services.github_webhook_registration import (  # noqa: E402
    ensure_webhooks_registered,
    load_github_webhook_settings_from_env,
)


async def _main() -> int:
    settings = load_github_webhook_settings_from_env()
    if not settings:
        print(
            "Missing required env vars: "
            "GITHUB_TOKEN, GITHUB_WEBHOOK_URL, GITHUB_WEBHOOK_SECRET, GITHUB_WEBHOOK_REPOS"
        )
        return 2
    results = await ensure_webhooks_registered(settings)
    for r in results:
        print(f"{r['repo']}: {r['action']} (hook_id={r.get('hook_id')})")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(_main()))


if __name__ == "__main__":
    main()

