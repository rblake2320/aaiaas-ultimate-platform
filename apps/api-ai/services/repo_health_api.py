from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.repo_health import DEFAULT_REPO_ROOT, RepoHealthReport, compute_repo_health

router = APIRouter(tags=["repo-health"])


class RepoHealthFindingModel(BaseModel):
    id: str
    title: str
    description: str
    category: str
    severity: str = Field(pattern="^(low|medium|high|critical)$")
    priority_score: int = Field(ge=0, le=100)
    suggested_fix: str
    evidence: Dict[str, Any]


class RepoHealthResponse(BaseModel):
    repo_root: str
    total_score: int = Field(ge=0, le=100)
    category_scores: Dict[str, int]
    signals: Dict[str, Any]
    findings: List[RepoHealthFindingModel]


def _to_model(report: RepoHealthReport) -> RepoHealthResponse:
    return RepoHealthResponse(
        repo_root=report.repo_root,
        total_score=report.total_score,
        category_scores=report.category_scores,
        signals=report.signals,
        findings=[
            RepoHealthFindingModel(
                id=f.id,
                title=f.title,
                description=f.description,
                category=f.category,
                severity=f.severity,
                priority_score=f.priority_score,
                suggested_fix=f.suggested_fix,
                evidence=f.evidence,
            )
            for f in report.findings
        ],
    )


@router.get("/health", response_model=RepoHealthResponse)
def get_repo_health(
    path: Optional[str] = Query(
        default=None,
        description="Optional filesystem path to the repo root. Must be within the service's default repo root.",
    )
):
    base = DEFAULT_REPO_ROOT.resolve()
    target = (Path(path).resolve() if path else base)

    # Minimal safety: don't allow arbitrary filesystem browsing outside the repo.
    try:
        target.relative_to(base)
    except Exception:
        raise HTTPException(status_code=400, detail="path must be within the default repo root")

    return _to_model(compute_repo_health(target))

