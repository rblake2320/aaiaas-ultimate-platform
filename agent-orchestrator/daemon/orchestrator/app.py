from __future__ import annotations

from fastapi import FastAPI, HTTPException

from orchestrator.config import Settings
from orchestrator.orchestrator import Orchestrator, build_default_deps


app = FastAPI(title="agent-orchestrator-daemon", version="0.1.0")

_orchestrator: Orchestrator | None = None


def _get_orchestrator() -> Orchestrator:
    global _orchestrator
    if _orchestrator is None:
        settings = Settings()
        deps = build_default_deps(settings)
        _orchestrator = Orchestrator(deps)
    return _orchestrator


@app.on_event("startup")
async def _startup() -> None:
    orch = _get_orchestrator()
    orch.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global _orchestrator
    if _orchestrator is not None:
        await _orchestrator.stop()


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {"ok": True}


@app.get("/status")
async def status() -> dict[str, object]:
    orch = _get_orchestrator()
    return {
        "state": orch.state.model_dump(),
        "recent_work_items": [w.__dict__ for w in orch.store.list_recent(limit=50)],
    }


@app.post("/trigger/scan")
async def trigger_scan() -> dict[str, object]:
    orch = _get_orchestrator()
    orch.trigger_scan()
    return {"ok": True}


@app.post("/scan/once")
async def scan_once() -> dict[str, object]:
    orch = _get_orchestrator()
    try:
        summary = await orch.scan_once()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"ok": True, "summary": summary}

