"""
Agent Orchestrator worker loop.

Runs continuously:
- claim due runs with a lease
- execute agent task
- persist result/events
- retry with exponential backoff
- recover stale leases on startup and periodically
"""

from __future__ import annotations

import asyncio
import os
import random
import signal
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from services.agent_service import create_agent
from services.orchestrator_store import OrchestratorRun, OrchestratorStore


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except Exception:
        return default


def _now_epoch() -> int:
    return int(time.time())


def _compute_backoff_seconds(attempts: int, base: float = 2.0, cap: float = 300.0) -> int:
    """
    attempts: number of attempts already made (0-based in DB, but we increment on failure).
    """
    # After first failure, attempts becomes 1 -> delay base^1
    exp = min(cap, base ** max(1, attempts))
    # Full jitter
    return int(random.uniform(0, exp))


def _run_coro_in_new_loop(coro: Awaitable[Any]) -> Any:
    """
    Run a coroutine in a dedicated event loop in the current thread.
    """
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        try:
            loop.close()
        finally:
            asyncio.set_event_loop(None)


@dataclass
class OrchestratorConfig:
    db_path: str
    worker_id: str
    poll_interval_seconds: float = 1.0
    lease_seconds: int = 120
    concurrency: int = 2
    recover_interval_seconds: int = 30


AgentRunner = Callable[[str, str, Dict[str, Any]], Dict[str, Any]]


def default_agent_runner(agent_type: str, task: str, agent_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Default runner: instantiate Agent from existing framework and run the task.
    """
    tools = agent_config.get("tools")
    agent = create_agent(agent_type=agent_type, tools=tools)
    if "model" in agent_config:
        agent.model = agent_config["model"]
    if "temperature" in agent_config:
        agent.temperature = agent_config["temperature"]
    if "max_iterations" in agent_config:
        agent.max_iterations = agent_config["max_iterations"]
    return _run_coro_in_new_loop(agent.run(task))


class AgentOrchestrator:
    def __init__(
        self,
        config: OrchestratorConfig,
        *,
        store: Optional[OrchestratorStore] = None,
        runner: AgentRunner = default_agent_runner,
    ):
        self.config = config
        self.store = store or OrchestratorStore(config.db_path)
        self.runner = runner

        self._stop_event = threading.Event()
        self._executor = ThreadPoolExecutor(max_workers=max(1, config.concurrency))
        self._inflight: set[str] = set()

    def stop(self) -> None:
        self._stop_event.set()

    def close(self) -> None:
        try:
            self._executor.shutdown(wait=False, cancel_futures=True)
        except Exception:
            pass
        try:
            self.store.close()
        except Exception:
            pass

    def run_forever(self) -> None:
        """
        Blocking call. Intended to run as a long-lived process.
        """
        self._install_signal_handlers()
        try:
            self._run_loop()
        finally:
            self.close()

    def _install_signal_handlers(self) -> None:
        def _handler(_signum, _frame):
            self.stop()

        try:
            signal.signal(signal.SIGINT, _handler)
            signal.signal(signal.SIGTERM, _handler)
        except Exception:
            # Not supported in some environments/threads.
            pass

    def _run_loop(self) -> None:
        last_recover = 0.0
        meta = {"pid": os.getpid(), "concurrency": self.config.concurrency}

        # On startup, immediately release expired leases (crash recovery)
        self.store.recover_stale_runs(stale_before_epoch=_now_epoch())

        while not self._stop_event.is_set():
            now = time.time()

            # Heartbeat & recovery
            self.store.heartbeat(worker_id=self.config.worker_id, meta=meta)
            if now - last_recover >= float(self.config.recover_interval_seconds):
                self.store.recover_stale_runs(stale_before_epoch=_now_epoch())
                last_recover = now

            # If capacity available, claim and dispatch
            while (len(self._inflight) < self.config.concurrency) and (not self._stop_event.is_set()):
                run = self.store.claim_due_run(
                    worker_id=self.config.worker_id,
                    lease_seconds=self.config.lease_seconds,
                )
                if not run:
                    break

                self._inflight.add(run.run_id)
                self.store.append_event(run.run_id, "run_started", {"worker_id": self.config.worker_id})
                self._executor.submit(self._execute_one, run)

            time.sleep(max(0.05, float(self.config.poll_interval_seconds)))

    def _execute_one(self, run: OrchestratorRun) -> None:
        try:
            agent = self.store.get_agent(run.agent_id)
            if not agent:
                self.store.mark_failed_or_retry(
                    run_id=run.run_id,
                    worker_id=self.config.worker_id,
                    error=f"Agent not found: {run.agent_id}",
                    next_scheduled_for=None,
                    will_retry=False,
                )
                return

            agent_type = agent["agent_type"]
            agent_config = agent["config"]

            # Execute with periodic lease extension in a side-thread ticker
            stop_lease = threading.Event()

            def _lease_ticker():
                while not stop_lease.is_set():
                    try:
                        self.store.extend_lease(
                            run_id=run.run_id,
                            worker_id=self.config.worker_id,
                            lease_seconds=self.config.lease_seconds,
                        )
                    except Exception:
                        pass
                    stop_lease.wait(max(1.0, self.config.lease_seconds / 3))

            t = threading.Thread(target=_lease_ticker, daemon=True)
            t.start()
            try:
                result = self.runner(agent_type, run.task, agent_config)
            finally:
                stop_lease.set()

            interval = run.interval_seconds
            if interval and interval > 0:
                next_due = _now_epoch() + int(interval)
                self.store.reschedule_recurring(
                    run_id=run.run_id,
                    worker_id=self.config.worker_id,
                    next_scheduled_for=next_due,
                    result=result,
                )
            else:
                self.store.mark_succeeded(run_id=run.run_id, worker_id=self.config.worker_id, result=result)
        except Exception as e:
            # Determine retry
            refreshed = self.store.get_run(run.run_id)
            attempts = (refreshed.attempts if refreshed else run.attempts) + 1
            max_attempts = refreshed.max_attempts if refreshed else run.max_attempts
            will_retry = attempts < max_attempts
            next_due = _now_epoch() + _compute_backoff_seconds(attempts) if will_retry else None
            self.store.mark_failed_or_retry(
                run_id=run.run_id,
                worker_id=self.config.worker_id,
                error=str(e),
                next_scheduled_for=next_due,
                will_retry=will_retry,
            )
        finally:
            self._inflight.discard(run.run_id)


def load_orchestrator_config_from_env() -> OrchestratorConfig:
    db_path = os.getenv("ORCH_DB_PATH", os.path.join(os.getcwd(), "orchestrator.db"))
    worker_id = os.getenv("ORCH_WORKER_ID", f"orch-{uuid.uuid4().hex[:10]}")
    return OrchestratorConfig(
        db_path=db_path,
        worker_id=worker_id,
        poll_interval_seconds=_env_float("ORCH_POLL_INTERVAL_SECONDS", 1.0),
        lease_seconds=_env_int("ORCH_LEASE_SECONDS", 120),
        concurrency=_env_int("ORCH_CONCURRENCY", 2),
        recover_interval_seconds=_env_int("ORCH_RECOVER_INTERVAL_SECONDS", 30),
    )

