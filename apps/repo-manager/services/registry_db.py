from __future__ import annotations

import json
import os
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _utc_now_epoch() -> int:
    return int(time.time())


@dataclass(frozen=True)
class RepoRecord:
    repo_id: str
    full_name: str
    clone_url: str
    default_branch: Optional[str]
    installation_id: Optional[int]
    local_path: Optional[str]
    active: int
    last_event_type: Optional[str]
    last_event_at: Optional[str]
    last_scan_at: Optional[str]
    health_status: str
    health_details_json: str
    created_at: str
    updated_at: str

    @property
    def health_details(self) -> Dict[str, Any]:
        try:
            return json.loads(self.health_details_json or "{}")
        except Exception:
            return {}


class RepoRegistryStore:
    """
    SQLite-backed registry for tracked repos.

    Concurrency notes:
    - Uses WAL mode
    - Upserts are used for idempotent sync.
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
            CREATE TABLE IF NOT EXISTS repo_manager_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS repo_registry (
              repo_id TEXT PRIMARY KEY,
              full_name TEXT NOT NULL UNIQUE,
              clone_url TEXT NOT NULL,
              default_branch TEXT,
              installation_id INTEGER,
              local_path TEXT,
              active INTEGER NOT NULL DEFAULT 1,
              last_event_type TEXT,
              last_event_at TEXT,
              last_scan_at TEXT,
              health_status TEXT NOT NULL DEFAULT 'unknown',
              health_details_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )

        cur.execute("CREATE INDEX IF NOT EXISTS idx_repo_registry_active ON repo_registry(active);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_repo_registry_last_scan ON repo_registry(last_scan_at);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_repo_registry_health ON repo_registry(health_status);")
        self._conn.commit()

    # --- Settings
    def get_setting(self, key: str) -> Optional[str]:
        row = self._conn.execute("SELECT value FROM repo_manager_settings WHERE key=?", (key,)).fetchone()
        if not row:
            return None
        return str(row["value"])

    def set_setting(self, key: str, value: str) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            """
            INSERT INTO repo_manager_settings(key, value, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
              value=excluded.value,
              updated_at=excluded.updated_at
            """,
            (key, value, now),
        )
        self._conn.commit()

    # --- Repos
    def upsert_repo(
        self,
        *,
        repo_id: str,
        full_name: str,
        clone_url: str,
        default_branch: Optional[str] = None,
        installation_id: Optional[int] = None,
        local_path: Optional[str] = None,
        active: int = 1,
    ) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            """
            INSERT INTO repo_registry(
              repo_id, full_name, clone_url, default_branch, installation_id, local_path,
              active, created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(full_name) DO UPDATE SET
              repo_id=excluded.repo_id,
              clone_url=excluded.clone_url,
              default_branch=COALESCE(excluded.default_branch, repo_registry.default_branch),
              installation_id=COALESCE(excluded.installation_id, repo_registry.installation_id),
              local_path=COALESCE(excluded.local_path, repo_registry.local_path),
              active=excluded.active,
              updated_at=excluded.updated_at
            """,
            (repo_id, full_name, clone_url, default_branch, installation_id, local_path, active, now, now),
        )
        self._conn.commit()

    def set_local_path(self, full_name: str, local_path: str) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            "UPDATE repo_registry SET local_path=?, updated_at=? WHERE full_name=?",
            (local_path, now, full_name),
        )
        self._conn.commit()

    def record_event(self, full_name: str, event_type: str) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            """
            UPDATE repo_registry
            SET last_event_type=?, last_event_at=?, updated_at=?
            WHERE full_name=?
            """,
            (event_type, now, now, full_name),
        )
        self._conn.commit()

    def mark_scanned(self, full_name: str) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            "UPDATE repo_registry SET last_scan_at=?, updated_at=? WHERE full_name=?",
            (now, now, full_name),
        )
        self._conn.commit()

    def set_health(self, full_name: str, status: str, details: Dict[str, Any]) -> None:
        now = _utc_now_iso()
        self._conn.execute(
            """
            UPDATE repo_registry
            SET health_status=?, health_details_json=?, updated_at=?
            WHERE full_name=?
            """,
            (status, json.dumps(details), now, full_name),
        )
        self._conn.commit()

    def get_repo(self, full_name: str) -> Optional[RepoRecord]:
        row = self._conn.execute("SELECT * FROM repo_registry WHERE full_name=?", (full_name,)).fetchone()
        if not row:
            return None
        return RepoRecord(**dict(row))

    def list_repos(self, *, active_only: bool = True, limit: int = 500, offset: int = 0) -> List[RepoRecord]:
        if active_only:
            rows = self._conn.execute(
                """
                SELECT * FROM repo_registry
                WHERE active=1
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        else:
            rows = self._conn.execute(
                """
                SELECT * FROM repo_registry
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        return [RepoRecord(**dict(r)) for r in rows]

    def deactivate_missing_repos(self, *, seen_full_names: List[str]) -> int:
        """
        Mark repos not present in `seen_full_names` as inactive.
        """
        now = _utc_now_iso()
        seen_set = set(seen_full_names)
        rows = self._conn.execute("SELECT full_name FROM repo_registry WHERE active=1").fetchall()
        to_deactivate = [r["full_name"] for r in rows if r["full_name"] not in seen_set]
        if not to_deactivate:
            return 0
        qmarks = ",".join(["?"] * len(to_deactivate))
        res = self._conn.execute(
            f"UPDATE repo_registry SET active=0, updated_at=? WHERE full_name IN ({qmarks})",
            (now, *to_deactivate),
        )
        self._conn.commit()
        return res.rowcount

    def stats(self) -> Dict[str, Any]:
        total = self._conn.execute("SELECT COUNT(*) AS c FROM repo_registry").fetchone()["c"]
        active = self._conn.execute("SELECT COUNT(*) AS c FROM repo_registry WHERE active=1").fetchone()["c"]
        by_health = self._conn.execute(
            "SELECT health_status, COUNT(*) AS c FROM repo_registry GROUP BY health_status"
        ).fetchall()
        return {
            "total": int(total),
            "active": int(active),
            "by_health": {r["health_status"]: int(r["c"]) for r in by_health},
            "now_epoch": _utc_now_epoch(),
        }

