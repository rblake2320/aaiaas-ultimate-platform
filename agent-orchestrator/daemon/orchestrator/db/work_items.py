from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from typing import Any, Literal


WorkType = Literal["repo_scan", "github_issue", "check_failure", "manual"]
WorkStatus = Literal["queued", "in_progress", "completed", "failed", "skipped"]


@dataclass(frozen=True)
class WorkItem:
    id: int
    created_at_unix: float
    updated_at_unix: float
    repo_name: str
    type: WorkType
    status: WorkStatus
    title: str
    dedupe_key: str | None
    payload_json: str
    error: str | None


class WorkItemStore:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init()

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self._db_path, timeout=30)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL;")
        return con

    def _init(self) -> None:
        con = self._connect()
        try:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS work_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at_unix REAL NOT NULL,
                    updated_at_unix REAL NOT NULL,
                    repo_name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    title TEXT NOT NULL,
                    dedupe_key TEXT,
                    payload_json TEXT NOT NULL,
                    error TEXT
                );
                """
            )
            # Lightweight migrations (for older sqlite files)
            cols = con.execute("PRAGMA table_info(work_items);").fetchall()
            col_names = {c["name"] for c in cols}
            if "dedupe_key" not in col_names:
                con.execute("ALTER TABLE work_items ADD COLUMN dedupe_key TEXT;")
            con.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_work_items_status
                ON work_items(status, updated_at_unix);
                """
            )
            con.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_dedupe
                ON work_items(dedupe_key)
                WHERE dedupe_key IS NOT NULL;
                """
            )
            con.commit()
        finally:
            con.close()

    def enqueue(
        self,
        *,
        repo_name: str,
        type: WorkType,
        title: str,
        payload_json: str,
        dedupe_key: str | None = None,
    ) -> int:
        now = time.time()
        con = self._connect()
        try:
            cur = con.execute(
                """
                INSERT INTO work_items
                (created_at_unix, updated_at_unix, repo_name, type, status, title, dedupe_key, payload_json, error)
                VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, NULL)
                ON CONFLICT(dedupe_key) DO NOTHING
                """,
                (now, now, repo_name, type, title, dedupe_key, payload_json),
            )
            con.commit()
            if cur.lastrowid:
                return int(cur.lastrowid)
            if dedupe_key is None:
                return 0
            row = con.execute(
                "SELECT id FROM work_items WHERE dedupe_key=? LIMIT 1",
                (dedupe_key,),
            ).fetchone()
            return 0 if row is None else -int(row["id"])
        finally:
            con.close()

    def list_recent(self, limit: int = 50) -> list[WorkItem]:
        con = self._connect()
        try:
            rows = con.execute(
                """
                SELECT *
                FROM work_items
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [self._row_to_item(r) for r in rows]
        finally:
            con.close()

    def claim_next(self) -> WorkItem | None:
        """
        Claims the next queued work item (FIFO-ish by id).
        """
        con = self._connect()
        try:
            con.execute("BEGIN IMMEDIATE;")
            row = con.execute(
                """
                SELECT *
                FROM work_items
                WHERE status='queued'
                ORDER BY id ASC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                con.execute("COMMIT;")
                return None
            now = time.time()
            con.execute(
                """
                UPDATE work_items
                SET status='in_progress', updated_at_unix=?
                WHERE id=?
                """,
                (now, row["id"]),
            )
            con.execute("COMMIT;")
            updated = dict(row)
            updated["status"] = "in_progress"
            updated["updated_at_unix"] = now
            return self._row_to_item(updated)
        except Exception:
            con.execute("ROLLBACK;")
            raise
        finally:
            con.close()

    def mark_done(self, work_id: int, *, status: WorkStatus, error: str | None = None) -> None:
        if status not in ("completed", "failed", "skipped"):
            raise ValueError("final status must be completed/failed/skipped")
        con = self._connect()
        try:
            con.execute(
                """
                UPDATE work_items
                SET status=?, updated_at_unix=?, error=?
                WHERE id=?
                """,
                (status, time.time(), error, work_id),
            )
            con.commit()
        finally:
            con.close()

    @staticmethod
    def _row_to_item(row: sqlite3.Row | dict[str, Any]) -> WorkItem:
        if isinstance(row, sqlite3.Row):
            row = dict(row)
        return WorkItem(
            id=int(row["id"]),
            created_at_unix=float(row["created_at_unix"]),
            updated_at_unix=float(row["updated_at_unix"]),
            repo_name=str(row["repo_name"]),
            type=row["type"],
            status=row["status"],
            title=str(row["title"]),
            dedupe_key=None if row.get("dedupe_key") is None else str(row.get("dedupe_key")),
            payload_json=str(row["payload_json"]),
            error=row["error"] if row["error"] is None else str(row["error"]),
        )

