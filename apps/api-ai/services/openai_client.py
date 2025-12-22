"""
Shared OpenAI client utilities.

We intentionally avoid constructing the OpenAI client at import-time in other
modules so that the service can start (and tests can run) even when OpenAI
credentials are not configured.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional


def get_openai_api_key() -> Optional[str]:
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        api_key = api_key.strip()
    return api_key or None


def has_openai_configured() -> bool:
    return get_openai_api_key() is not None


@lru_cache(maxsize=1)
def get_openai_client():
    """
    Return a cached OpenAI client.

    Raises:
        RuntimeError: if OPENAI_API_KEY is not configured.
    """

    api_key = get_openai_api_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    # Import lazily so importing this module never fails due to optional deps.
    from openai import OpenAI

    return OpenAI(api_key=api_key)

