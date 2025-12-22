"""
Agent Orchestrator durable store (SQLite).

Goals:
- Minimal dependencies (stdlib only)
- Durable persistence + crash recovery
- Cooperative leasing for multi-worker execution
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _utc_now_epoch() -> int:
    return int(time.time())


@dataclass(frozen=True)
class OrchestratorRun:
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


class OrchestratorStore:
    """
    SQLite-backed store.

    Concurrency notes:
    - Uses WAL mode
    - Claims jobs via an atomic UPDATE guarded by a short lease
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)) or ".", exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.execute("PRAGMA synchronous=NORMAL;")
        self._conn.execute("PRAGMA foreign_keys=ON;")
        self._init_schema()

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:
            pass

    def _init_schema(self) -> None:
        cur = self._conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS orchestrator_agents (
              agent_id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              agent_type TEXT NOT NULL,
              config_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS orchestrator_runs (
              run_id TEXT PRIMARY KEY,
              agent_id TEXT NOT NULL,
              task TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              scheduled_for INTEGER NOT NULL,
              interval_seconds INTEGER,
              attempts INTEGER NOT NULL DEFAULT 0,
              max_attempts INTEGER NOT NULL DEFAULT 5,
              last_error TEXT,
              lease_owner TEXT,
              lease_expires_at INTEGER,
              FOREIGN KEY (agent_id) REFERENCES orchestrator_agents(agent_id) ON DELETE CASCADE
            );
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_due
            ON orchestrator_runs(status, scheduled_for);
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_lease
            ON orchestrator_runs(status, lease_expires_at);
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS orchestrator_events (
              event_id TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              ts TEXT NOT NULL,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              FOREIGN KEY (run_id) REFERENCES orchestrator_runs(run_id) ON DELETE CASCADE
            );
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_orchestrator_events_run
            ON orchestrator_events(run_id, ts);
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS orchestrator_workers (
              worker_id TEXT PRIMARY KEY,
              last_heartbeat_at INTEGER NOT NULL,
              meta_json TEXT NOT NULL
            );
            """
        )

        self._conn.commit()

    # --- Agents
    def create_agent(
        self,
        *,
        name: str,
        agent_type: str,
        config: Dict[str, Any],
        agent_id: Optional[str] = None,
    ) -> str:
        aid = agent_id or str(uuid.uuid4())
        now = _utc_now_iso()
        self._conn.execute(
            """
            INSERT INTO orchestrator_agents(agent_id, name, agent_type, config_json, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (aid, name, agent_type, json.dumps(config), now, now),
        )
        self._conn.commit()
        return aid

    def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn.execute(
            "SELECT agent_id, name, agent_type, config_json, created_at, updated_at FROM orchestrator_agents WHERE agent_id=?",
            (agent_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "agent_id": row["agent_id"],
            "name": row["name"],
            "agent_type": row["agent_type"],
            "config": json.loads(row["config_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_agents(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT agent_id, name, agent_type, config_json, created_at, updated_at
            FROM orchestrator_agents
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        return [
            {
                "agent_id": r["agent_id"],
                "name": r["name"],
                "agent_type": r["agent_type"],
                "config": json.loads(r["config_json"]),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]

    # --- Runs
    def enqueue_run(
        self,
        *,
        agent_id: str,
        task: str,
        scheduled_for: Optional[int] = None,
        interval_seconds: Optional[int] = None,
        max_attempts: int = 5,
        run_id: Optional[str] = None,
    ) -> str:
        rid = run_id or str(uuid.uuid4())
        now_iso = _utc_now_iso()
        due = scheduled_for if scheduled_for is not None else _utc_now_epoch()
        self._conn.execute(
            """
            INSERT INTO orchestrator_runs(
              run_id, agent_id, task, status, created_at, updated_at, scheduled_for,
              interval_seconds, attempts, max_attempts, last_error, lease_owner, lease_expires_at
            )
            VALUES(?, ?, ?, 'queued', ?, ?, ?, ?, 0, ?, NULL, NULL, NULL)
            """,
            (rid, agent_id, task, now_iso, now_iso, due, interval_seconds, max_attempts),
        )
        self.append_event(rid, "run_queued", {"scheduled_for": due, "interval_seconds": interval_seconds})
        self._conn.commit()
        return rid

    def get_run(self, run_id: str) -> Optional[OrchestratorRun]:
        row = self._conn.execute("SELECT * FROM orchestrator_runs WHERE run_id=?", (run_id,)).fetchone()
        if not row:
            return None
        return OrchestratorRun(
            run_id=row["run_id"],
            agent_id=row["agent_id"],
            task=row["task"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            scheduled_for=row["scheduled_for"],
            interval_seconds=row["interval_seconds"],
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
            last_error=row["last_error"],
            lease_owner=row["lease_owner"],
            lease_expires_at=row["lease_expires_at"],
        )

    def list_runs(self, limit: int = 100, offset: int = 0, status: Optional[str] = None) -> List[OrchestratorRun]:
        if status:
            rows = self._conn.execute(
                """
                SELECT * FROM orchestrator_runs
                WHERE status=?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (status, limit, offset),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """
                SELECT * FROM orchestrator_runs
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        return [
            OrchestratorRun(
                run_id=r["run_id"],
                agent_id=r["agent_id"],
                task=r["task"],
                status=r["status"],
                created_at=r["created_at"],
                updated_at=r["updated_at"],
                scheduled_for=r["scheduled_for"],
                interval_seconds=r["interval_seconds"],
                attempts=r["attempts"],
                max_attempts=r["max_attempts"],
                last_error=r["last_error"],
                lease_owner=r["lease_owner"],
                lease_expires_at=r["lease_expires_at"],
            )
            for r in rows
        ]

    def claim_due_run(self, *, worker_id: str, lease_seconds: int) -> Optional[OrchestratorRun]:
        """
        Claim one due run atomically.

        Select candidate -> attempt UPDATE with guard -> re-read.
        """
        now_epoch = _utc_now_epoch()
        lease_expires = now_epoch + lease_seconds

        row = self._conn.execute(
            """
            SELECT run_id
            FROM orchestrator_runs
            WHERE status IN ('queued', 'retry')
              AND scheduled_for <= ?
              AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
            ORDER BY scheduled_for ASC, created_at ASC
            LIMIT 1
            """,
            (now_epoch, now_epoch),
        ).fetchone()

        if not row:
            return None

        run_id = row["run_id"]
        now_iso = _utc_now_iso()
        res = self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET status='running',
                updated_at=?,
                lease_owner=?,
                lease_expires_at=?
            WHERE run_id=?
              AND status IN ('queued', 'retry')
              AND scheduled_for <= ?
              AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
            """,
            (now_iso, worker_id, lease_expires, run_id, now_epoch, now_epoch),
        )

        self._conn.commit()
        if res.rowcount != 1:
            return None

        self.append_event(run_id, "run_claimed", {"worker_id": worker_id, "lease_expires_at": lease_expires})
        self._conn.commit()
        return self.get_run(run_id)

    def extend_lease(self, *, run_id: str, worker_id: str, lease_seconds: int) -> bool:
        now_epoch = _utc_now_epoch()
        lease_expires = now_epoch + lease_seconds
        now_iso = _utc_now_iso()
        res = self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET updated_at=?, lease_expires_at=?
            WHERE run_id=? AND status='running' AND lease_owner=?
            """,
            (now_iso, lease_expires, run_id, worker_id),
        )
        self._conn.commit()
        return res.rowcount == 1

    def mark_succeeded(self, *, run_id: str, worker_id: str, result: Dict[str, Any]) -> None:
        now_iso = _utc_now_iso()
        self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET status='succeeded',
                updated_at=?,
                last_error=NULL,
                lease_owner=NULL,
                lease_expires_at=NULL
            WHERE run_id=? AND lease_owner=?
            """,
            (now_iso, run_id, worker_id),
        )
        self.append_event(run_id, "run_succeeded", {"result": result})
        self._conn.commit()

    def reschedule_recurring(self, *, run_id: str, worker_id: str, next_scheduled_for: int, result: Dict[str, Any]) -> None:
        now_iso = _utc_now_iso()
        self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET status='queued',
                updated_at=?,
                scheduled_for=?,
                last_error=NULL,
                lease_owner=NULL,
                lease_expires_at=NULL
            WHERE run_id=? AND lease_owner=?
            """,
            (now_iso, next_scheduled_for, run_id, worker_id),
        )
        self.append_event(
            run_id,
            "run_rescheduled",
            {"result": result, "next_scheduled_for": next_scheduled_for},
        )
        self._conn.commit()

    def mark_failed_or_retry(
        self,
        *,
        run_id: str,
        worker_id: str,
        error: str,
        next_scheduled_for: Optional[int],
        will_retry: bool,
    ) -> None:
        now_iso = _utc_now_iso()
        status = "retry" if will_retry else "failed"
        scheduled_for = next_scheduled_for if next_scheduled_for is not None else _utc_now_epoch()
        self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET status=?,
                updated_at=?,
                scheduled_for=?,
                last_error=?,
                attempts=attempts+1,
                lease_owner=NULL,
                lease_expires_at=NULL
            WHERE run_id=? AND lease_owner=?
            """,
            (status, now_iso, scheduled_for, error, run_id, worker_id),
        )
        self.append_event(
            run_id,
            "run_failed" if not will_retry else "run_retry_scheduled",
            {"error": error, "scheduled_for": scheduled_for, "will_retry": will_retry},
        )
        self._conn.commit()

    def recover_stale_runs(self, *, stale_before_epoch: int) -> int:
        """
        If a worker died mid-run, release leases so another worker can pick it up.
        """
        now_iso = _utc_now_iso()
        res = self._conn.execute(
            """
            UPDATE orchestrator_runs
            SET status='retry',
                updated_at=?,
                lease_owner=NULL,
                lease_expires_at=NULL,
                last_error=COALESCE(last_error, 'Recovered from stale lease')
            WHERE status='running'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at <= ?
            """,
            (now_iso, stale_before_epoch),
        )
        self._conn.commit()
        return res.rowcount

    # --- Events
    def append_event(self, run_id: str, event_type: str, payload: Dict[str, Any]) -> str:
        eid = str(uuid.uuid4())
        self._conn.execute(
            """
            INSERT INTO orchestrator_events(event_id, run_id, ts, type, payload_json)
            VALUES(?, ?, ?, ?, ?)
            """,
            (eid, run_id, _utc_now_iso(), event_type, json.dumps(payload)),
        )
        return eid

    def list_events(self, run_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT event_id, run_id, ts, type, payload_json
            FROM orchestrator_events
            WHERE run_id=?
            ORDER BY ts ASC
            LIMIT ?
            """,
            (run_id, limit),
        ).fetchall()
        return [
            {
                "event_id": r["event_id"],
                "run_id": r["run_id"],
                "ts": r["ts"],
                "type": r["type"],
                "payload": json.loads(r["payload_json"]),
            }
            for r in rows
        ]

    # --- Worker heartbeat
    def heartbeat(self, *, worker_id: str, meta: Optional[Dict[str, Any]] = None) -> None:
        meta = meta or {}
        self._conn.execute(
            """
            INSERT INTO orchestrator_workers(worker_id, last_heartbeat_at, meta_json)
            VALUES(?, ?, ?)
            ON CONFLICT(worker_id) DO UPDATE SET
              last_heartbeat_at=excluded.last_heartbeat_at,
              meta_json=excluded.meta_json
            """,
            (worker_id, _utc_now_epoch(), json.dumps(meta)),
        )
        self._conn.commit()

