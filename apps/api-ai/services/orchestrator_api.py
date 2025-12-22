"""
FastAPI router for the Agent Orchestrator.

This provides a lightweight control surface to:
- create agents
- enqueue runs (one-shot or recurring)
- inspect runs + event log
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from services.orchestrator_store import OrchestratorStore


router = APIRouter(tags=["orchestrator"])


def _get_store() -> OrchestratorStore:
    # One shared store instance per process
    if not hasattr(_get_store, "_store"):
        db_path = os.getenv("ORCH_DB_PATH", os.path.join(os.getcwd(), "orchestrator.db"))
        setattr(_get_store, "_store", OrchestratorStore(db_path))
    return getattr(_get_store, "_store")


async def verify_api_key(authorization: Optional[str] = Header(None)):
    """
    Keep the orchestrator router standalone (avoid circular import with main.py).
    """
    require = os.getenv("ORCH_REQUIRE_API_KEY", "false").lower() in {"1", "true", "yes"}
    if not require:
        return "disabled"
    if not authorization:
        raise HTTPException(status_code=401, detail="No authorization header")
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] not in ["Bearer", "ApiKey"]:
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    return parts[1]


class CreateAgentRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    agent_type: str = Field(default="general", pattern="^(general|researcher|analyst)$")
    model: str = Field(default="gpt-4.1-mini")
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_iterations: int = Field(default=10, ge=1, le=50)


class CreateAgentResponse(BaseModel):
    agent_id: str


class EnqueueRunRequest(BaseModel):
    agent_id: str
    task: str = Field(min_length=1)
    scheduled_for: Optional[int] = Field(
        default=None,
        description="Unix epoch seconds. If omitted, run immediately.",
    )
    interval_seconds: Optional[int] = Field(
        default=None,
        ge=1,
        description="If set, this run becomes recurring and will be re-queued after each success.",
    )
    max_attempts: int = Field(default=5, ge=1, le=50)


class EnqueueRunResponse(BaseModel):
    run_id: str


class RunResponse(BaseModel):
    run_id: str
    agent_id: str
    task: str
    status: str
    created_at: str
    updated_at: str
    scheduled_for: int
    interval_seconds: Optional[int]
    attempts: int
    max_attempts: int
    last_error: Optional[str]
    lease_owner: Optional[str]
    lease_expires_at: Optional[int]


class ListRunsResponse(BaseModel):
    runs: List[RunResponse]


class ListEventsResponse(BaseModel):
    events: List[Dict[str, Any]]


@router.post("/agents", response_model=CreateAgentResponse)
def create_agent_endpoint(
    request: CreateAgentRequest,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    agent_id = store.create_agent(
        name=request.name,
        agent_type=request.agent_type,
        config={
            "model": request.model,
            "temperature": request.temperature,
            "max_iterations": request.max_iterations,
        },
    )
    return CreateAgentResponse(agent_id=agent_id)


@router.get("/agents")
def list_agents_endpoint(
    limit: int = 100,
    offset: int = 0,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    return {"agents": store.list_agents(limit=limit, offset=offset)}


@router.post("/runs", response_model=EnqueueRunResponse)
def enqueue_run_endpoint(
    request: EnqueueRunRequest,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    agent = store.get_agent(request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    run_id = store.enqueue_run(
        agent_id=request.agent_id,
        task=request.task,
        scheduled_for=request.scheduled_for,
        interval_seconds=request.interval_seconds,
        max_attempts=request.max_attempts,
    )
    return EnqueueRunResponse(run_id=run_id)


@router.get("/runs", response_model=ListRunsResponse)
def list_runs_endpoint(
    limit: int = 100,
    offset: int = 0,
    status: Optional[str] = None,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    runs = store.list_runs(limit=limit, offset=offset, status=status)
    return ListRunsResponse(runs=[RunResponse(**r.__dict__) for r in runs])


@router.get("/runs/{run_id}", response_model=RunResponse)
def get_run_endpoint(
    run_id: str,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunResponse(**run.__dict__)


@router.get("/runs/{run_id}/events", response_model=ListEventsResponse)
def list_events_endpoint(
    run_id: str,
    limit: int = 200,
    _api_key: str = Depends(verify_api_key),
):
    store = _get_store()
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return ListEventsResponse(events=store.list_events(run_id, limit=limit))

