"""
Auto-Fix Service

Provides fix suggestions (and optionally patches) from an error report or other
problem description.

- Uses OpenAI when configured.
- Falls back to deterministic heuristics when OpenAI is not configured.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from typing import Any, Dict, List, Optional

from services.openai_client import has_openai_configured, get_openai_client

logger = logging.getLogger(__name__)


def _strip_code_fences(text: str) -> str:
    # Remove common ```json ... ``` wrapping
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _repair_json_like(text: str) -> Optional[str]:
    """
    Best-effort repair for JSON-like content (single quotes, trailing commas).
    Returns a normalized JSON string if parseable, otherwise None.
    """

    candidate = text.strip()
    candidate = candidate.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    # Remove trailing commas before ] or }
    candidate = re.sub(r",(\s*[\]}])", r"\1", candidate)
    # Replace single-quoted keys/strings with double quotes (best-effort)
    # This is intentionally conservative: only replaces when it looks like JSON.
    candidate = re.sub(r"(?P<prefix>[\{\[,]\s*)'(?P<key>[^'\\]+)'\s*:", r'\g<prefix>"\g<key>":', candidate)
    candidate = re.sub(r":\s*'(?P<val>[^'\\]*)'(?P<suffix>\s*[,}\]])", r': "\g<val>"\g<suffix>', candidate)

    try:
        obj = json.loads(candidate)
    except Exception:
        return None

    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=True)


def _heuristic_suggestions(kind: str, problem: str) -> List[Dict[str, Any]]:
    lower = problem.lower()
    suggestions: List[Dict[str, Any]] = []

    if kind in {"json", "json_repair"}:
        repaired = _repair_json_like(problem)
        if repaired is not None:
            suggestions.append(
                {
                    "title": "Repair JSON formatting",
                    "rationale": "Input looks like JSON but fails strict parsing (common issues: single quotes, trailing commas).",
                    "steps": [
                        "Replace single quotes with double quotes for keys/strings.",
                        "Remove trailing commas before '}' or ']'.",
                        "Validate the result with a strict JSON parser.",
                    ],
                    "confidence": 0.85,
                    "patch": repaired,
                }
            )
            return suggestions

        suggestions.append(
            {
                "title": "Validate JSON payload",
                "rationale": "Could not repair into valid JSON deterministically.",
                "steps": [
                    "Run the payload through a JSON validator.",
                    "Ensure all keys/strings use double quotes.",
                    "Remove comments/trailing commas and retry.",
                ],
                "confidence": 0.4,
                "patch": None,
            }
        )
        return suggestions

    if "module not found" in lower or "cannot find module" in lower:
        suggestions.append(
            {
                "title": "Install missing dependency",
                "rationale": "Error indicates an import/require failure.",
                "steps": [
                    "Confirm the missing module/package name in the error message.",
                    "Install it (pip/poetry for Python, npm/pnpm/yarn for Node).",
                    "Restart the service and rerun the failing command.",
                ],
                "confidence": 0.75,
                "patch": None,
            }
        )

    if "syntaxerror" in lower:
        suggestions.append(
            {
                "title": "Fix syntax error at reported location",
                "rationale": "Syntax errors are usually local to the reported line/column.",
                "steps": [
                    "Go to the reported file/line/column in the stack trace.",
                    "Check for unmatched brackets/quotes, invalid tokens, or indentation issues.",
                    "Run the formatter/linter to catch remaining issues.",
                ],
                "confidence": 0.7,
                "patch": None,
            }
        )

    if not suggestions:
        suggestions.append(
            {
                "title": "Reduce to a minimal repro and add logging",
                "rationale": "No specific signature matched; collecting more context helps.",
                "steps": [
                    "Add structured logs around the failing area (inputs + key state).",
                    "Reduce to a minimal reproduction case.",
                    "Capture full stack trace and environment details (versions, config).",
                ],
                "confidence": 0.3,
                "patch": None,
            }
        )

    return suggestions


@dataclass(frozen=True)
class AutoFixResult:
    suggestions: List[Dict[str, Any]]
    used_llm: bool


class AutoFixService:
    async def auto_fix(
        self,
        *,
        kind: str,
        problem: str,
        context: Optional[str],
        language: Optional[str],
        want_patch: bool,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AutoFixResult:
        if not has_openai_configured():
            return AutoFixResult(
                suggestions=_heuristic_suggestions(kind=kind, problem=problem),
                used_llm=False,
            )

        system = (
            "You are an 'auto-fix' assistant. "
            "Return STRICT JSON only (no markdown, no code fences). "
            "Schema: {\"suggestions\": [{\"title\": string, \"rationale\": string, \"steps\": [string], "
            "\"confidence\": number between 0 and 1, \"patch\": string|null}]}. "
            "If you propose a patch, output the full corrected content in 'patch'."
        )
        user = {
            "kind": kind,
            "language": language,
            "want_patch": want_patch,
            "problem": problem,
            "context": context,
        }

        try:
            client = get_openai_client()
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )

            content = resp.choices[0].message.content or ""
            content = _strip_code_fences(content)

            parsed: Dict[str, Any]
            try:
                parsed = json.loads(content)
            except Exception:
                repaired = _repair_json_like(content)
                if repaired is None:
                    raise ValueError("Model did not return valid JSON")
                parsed = json.loads(repaired)

            suggestions = parsed.get("suggestions")
            if not isinstance(suggestions, list) or not suggestions:
                raise ValueError("No suggestions returned")

            # Light normalization
            normalized: List[Dict[str, Any]] = []
            for s in suggestions:
                if not isinstance(s, dict):
                    continue
                normalized.append(
                    {
                        "title": str(s.get("title", "Suggestion")).strip() or "Suggestion",
                        "rationale": str(s.get("rationale", "")).strip(),
                        "steps": [str(x) for x in (s.get("steps") or []) if str(x).strip()],
                        "confidence": float(s.get("confidence", 0.5)),
                        "patch": s.get("patch", None),
                    }
                )

            if not normalized:
                raise ValueError("Suggestions could not be normalized")

            return AutoFixResult(suggestions=normalized, used_llm=True)
        except Exception as e:
            logger.warning(f"Auto-fix LLM path failed, falling back to heuristics: {e}")
            return AutoFixResult(
                suggestions=_heuristic_suggestions(kind=kind, problem=problem),
                used_llm=False,
            )


auto_fix_service = AutoFixService()

