"""
Issue Detection Engine

Provides a deterministic, rule-based "issue detection" layer that can be used to
classify errors/logs/results into actionable issues with severity, confidence,
and recommended next steps.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple


Severity = str  # "low" | "medium" | "high" | "critical"


@dataclass(frozen=True)
class DetectedIssue:
    code: str
    title: str
    severity: Severity
    confidence: float
    description: str
    evidence: Optional[List[str]] = None
    recommendations: Optional[List[str]] = None
    category: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "code": self.code,
            "title": self.title,
            "severity": self.severity,
            "confidence": self.confidence,
            "description": self.description,
        }
        if self.category:
            out["category"] = self.category
        if self.evidence:
            out["evidence"] = self.evidence
        if self.recommendations:
            out["recommendations"] = self.recommendations
        return out


class IssueDetectionService:
    """
    Rule-based issue detection from free-form inputs.

    Supported kinds:
      - "text": analyze `text`
      - "api_error": analyze `payload` for status codes/messages
      - "workflow_run": analyze `payload` for status/error fields
      - "ocr_result": analyze `payload` for common OCR failure signals
    """

    _PATTERNS: Sequence[Tuple[str, re.Pattern[str], str, Severity, float, str, List[str]]] = (
        (
            "AUTH_UNAUTHORIZED",
            re.compile(r"\b(401|unauthorized|invalid api key|jwt|token expired)\b", re.I),
            "Authentication/authorization failure",
            "high",
            0.85,
            "AUTH",
            [
                "Verify the Authorization header format: `Bearer <token>`.",
                "Ensure the API key/JWT is valid and not revoked/expired.",
                "Check environment/config for auth secrets and issuer/audience settings.",
            ],
        ),
        (
            "AUTH_FORBIDDEN",
            re.compile(r"\b(403|forbidden|insufficient permissions|scope)\b", re.I),
            "Forbidden / missing permissions",
            "high",
            0.8,
            "AUTH",
            [
                "Verify the token/key has the required scopes/permissions.",
                "Check organization/role-based access settings.",
            ],
        ),
        (
            "RATE_LIMITED",
            re.compile(r"\b(429|rate limit|too many requests|x-ratelimit)\b", re.I),
            "Rate limit exceeded",
            "medium",
            0.8,
            "THROTTLING",
            [
                "Retry with exponential backoff.",
                "Reduce request concurrency or batch requests.",
                "Increase plan/quota or adjust rate limiter settings.",
            ],
        ),
        (
            "TIMEOUT",
            re.compile(r"\b(timeout|timed out|deadline exceeded|ETIMEDOUT)\b", re.I),
            "Request timed out",
            "medium",
            0.75,
            "NETWORK",
            [
                "Increase client/server timeout values if appropriate.",
                "Check downstream dependency latency (DB/Redis/OpenAI).",
                "Reduce payload size or enable streaming/batching.",
            ],
        ),
        (
            "CONNECTION_REFUSED",
            re.compile(r"\b(connection refused|ECONNREFUSED|cannot connect|failed to connect)\b", re.I),
            "Connection refused / service unreachable",
            "high",
            0.8,
            "NETWORK",
            [
                "Verify the target host/port is correct and reachable.",
                "Confirm the service is running and network policies allow access.",
                "If using Docker Compose, confirm containers and ports are up.",
            ],
        ),
        (
            "DNS_FAILURE",
            re.compile(r"\b(ENOTFOUND|DNS|name or service not known)\b", re.I),
            "DNS resolution failure",
            "medium",
            0.75,
            "NETWORK",
            [
                "Verify the hostname is correct.",
                "Check DNS/network configuration in the environment.",
            ],
        ),
        (
            "VALIDATION_ERROR",
            re.compile(r"\b(validation error|invalid.*(request|payload)|zod|pydantic)\b", re.I),
            "Request validation error",
            "medium",
            0.7,
            "INPUT",
            [
                "Check request schema and required fields.",
                "Validate types (string vs number) and bounds/constraints.",
            ],
        ),
        (
            "OPENAI_CONFIG_MISSING",
            re.compile(r"\b(OPENAI_API_KEY|no api key provided|api key.*missing)\b", re.I),
            "Missing or invalid OpenAI configuration",
            "high",
            0.8,
            "CONFIG",
            [
                "Set `OPENAI_API_KEY` in the environment for the AI service.",
                "Avoid placeholder keys (e.g. `sk-your...`).",
            ],
        ),
        (
            "TRACEBACK",
            re.compile(r"Traceback \(most recent call last\):", re.I),
            "Unhandled exception (traceback present)",
            "high",
            0.7,
            "RUNTIME",
            [
                "Inspect the traceback to find the root cause and failing line.",
                "Add structured error handling and input validation around the failing path.",
            ],
        ),
    )

    _OCR_FAILURE_PATTERNS: Sequence[Tuple[str, re.Pattern[str], str, Severity, float, str, List[str]]] = (
        (
            "OCR_DECODE_FAILED",
            re.compile(r"\b(base64|decode|incorrect padding|cannot identify image file)\b", re.I),
            "OCR input decode failed",
            "medium",
            0.75,
            "OCR",
            [
                "Ensure the image is valid base64 (no data URL prefix unless supported).",
                "Verify supported image type (JPEG/PNG/WEBP) and size limits.",
            ],
        ),
        (
            "OCR_PDF_CONVERSION_FAILED",
            re.compile(r"\b(pdf2image|poppler|pdf conversion|cannot read pdf)\b", re.I),
            "PDF to image conversion failed (OCR)",
            "medium",
            0.7,
            "OCR",
            [
                "Ensure Poppler is installed in the runtime image if required by `pdf2image`.",
                "Try a smaller PDF or reduce page count.",
            ],
        ),
    )

    _SEVERITY_RANK: Dict[str, int] = {"low": 10, "medium": 20, "high": 30, "critical": 40}

    def capabilities(self) -> Dict[str, Any]:
        return {
            "service": "Issue Detection Engine",
            "version": "1.0",
            "kinds": ["text", "api_error", "workflow_run", "ocr_result"],
            "severities": ["low", "medium", "high", "critical"],
            "detectors": sorted({p[0] for p in self._PATTERNS} | {p[0] for p in self._OCR_FAILURE_PATTERNS}),
        }

    def detect(
        self,
        *,
        kind: str,
        text: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        max_issues: int = 10,
        severity_threshold: str = "low",
    ) -> Dict[str, Any]:
        if max_issues < 1:
            max_issues = 1
        if max_issues > 50:
            max_issues = 50

        severity_threshold_rank = self._SEVERITY_RANK.get(severity_threshold, 10)

        combined_text = self._coerce_to_text(kind=kind, text=text, payload=payload)
        matches: List[DetectedIssue] = []

        patterns = list(self._PATTERNS)
        if kind == "ocr_result":
            patterns.extend(self._OCR_FAILURE_PATTERNS)

        for code, rx, title, severity, confidence, category, recs in patterns:
            if rx.search(combined_text or ""):
                evidence = self._extract_evidence(rx, combined_text)
                description = self._default_description(kind=kind, code=code, title=title)
                matches.append(
                    DetectedIssue(
                        code=code,
                        title=title,
                        severity=severity,
                        confidence=confidence,
                        description=description,
                        evidence=evidence,
                        recommendations=recs,
                        category=category,
                    )
                )

        # Kind-specific structured detection
        matches.extend(self._structured_checks(kind=kind, payload=payload))

        # Filter by threshold, de-duplicate by code, then sort by severity desc & confidence desc
        dedup: Dict[str, DetectedIssue] = {}
        for issue in matches:
            if self._SEVERITY_RANK.get(issue.severity, 10) < severity_threshold_rank:
                continue
            prev = dedup.get(issue.code)
            if not prev or (issue.confidence, self._SEVERITY_RANK.get(issue.severity, 10)) > (
                prev.confidence,
                self._SEVERITY_RANK.get(prev.severity, 10),
            ):
                dedup[issue.code] = issue

        final_issues = sorted(
            dedup.values(),
            key=lambda i: (self._SEVERITY_RANK.get(i.severity, 10), i.confidence),
            reverse=True,
        )[:max_issues]

        return {
            "kind": kind,
            "issues": [i.to_dict() for i in final_issues],
            "count": len(final_issues),
        }

    def _coerce_to_text(self, *, kind: str, text: Optional[str], payload: Optional[Dict[str, Any]]) -> str:
        if text and isinstance(text, str):
            return text
        if not payload:
            return ""

        # Heuristics for common payload shapes
        if kind == "api_error":
            parts = []
            for k in ("message", "error", "detail", "code"):
                v = payload.get(k)
                if isinstance(v, str) and v.strip():
                    parts.append(v.strip())
            status = payload.get("status") or payload.get("status_code") or payload.get("statusCode")
            if status is not None:
                parts.append(str(status))
            return "\n".join(parts)

        if kind == "workflow_run":
            parts = []
            for k in ("status", "error", "error_message", "errorMessage"):
                v = payload.get(k)
                if isinstance(v, str) and v.strip():
                    parts.append(v.strip())
            return "\n".join(parts)

        if kind == "ocr_result":
            parts = []
            for k in ("status", "error", "detail", "message"):
                v = payload.get(k)
                if isinstance(v, str) and v.strip():
                    parts.append(v.strip())
            # OCR often returns nested structures; include a shallow stringification
            if "result" in payload:
                parts.append(str(payload.get("result")))
            return "\n".join(parts)

        return str(payload)

    def _extract_evidence(self, rx: re.Pattern[str], text: str, window: int = 80) -> List[str]:
        evidence: List[str] = []
        for m in rx.finditer(text or ""):
            start = max(m.start() - window, 0)
            end = min(m.end() + window, len(text))
            snippet = text[start:end].strip()
            if snippet and snippet not in evidence:
                evidence.append(snippet)
            if len(evidence) >= 3:
                break
        return evidence

    def _default_description(self, *, kind: str, code: str, title: str) -> str:
        return f"Detected issue `{code}` while analyzing `{kind}`: {title}."

    def _structured_checks(self, *, kind: str, payload: Optional[Dict[str, Any]]) -> List[DetectedIssue]:
        if not payload:
            return []

        issues: List[DetectedIssue] = []

        if kind == "workflow_run":
            status = payload.get("status")
            if isinstance(status, str) and status.lower() == "failed":
                issues.append(
                    DetectedIssue(
                        code="WORKFLOW_FAILED",
                        title="Workflow execution failed",
                        severity="high",
                        confidence=0.75,
                        category="WORKFLOWS",
                        description="Workflow run status indicates failure.",
                        evidence=[f"status={status}"],
                        recommendations=[
                            "Inspect `error_message` and failing node output for root cause.",
                            "Add retries/backoff for transient network dependencies.",
                        ],
                    )
                )

        if kind == "api_error":
            status = payload.get("status") or payload.get("status_code") or payload.get("statusCode")
            try:
                status_int = int(status) if status is not None else None
            except Exception:
                status_int = None
            if status_int and status_int >= 500:
                issues.append(
                    DetectedIssue(
                        code="UPSTREAM_5XX",
                        title="Upstream/server error (5xx)",
                        severity="high",
                        confidence=0.7,
                        category="UPSTREAM",
                        description="The error payload indicates a server-side failure.",
                        evidence=[f"status={status_int}"],
                        recommendations=[
                            "Retry with backoff if safe, and log correlation IDs for tracing.",
                            "Check service logs for the failing request path.",
                        ],
                    )
                )

        return issues


issue_detection_service = IssueDetectionService()

