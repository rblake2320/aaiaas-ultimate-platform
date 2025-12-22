from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


@dataclass(frozen=True)
class StoredPattern:
    id: str
    rel_path: str
    language: str
    kind: str
    content: str
    meta: dict[str, Any]
    embedding: np.ndarray  # float32 [dim]


class EmbeddingStore:
    """
    SQLite-backed embedding store (simple + portable).
    """

    def __init__(self, db_path: str) -> None:
        _ensure_dir(os.path.dirname(db_path))
        self.db_path = db_path
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS patterns (
                  id TEXT PRIMARY KEY,
                  rel_path TEXT NOT NULL,
                  language TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  content TEXT NOT NULL,
                  meta_json TEXT NOT NULL,
                  embedding BLOB NOT NULL,
                  dim INTEGER NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_patterns_rel_path ON patterns(rel_path)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_patterns_kind ON patterns(kind)")

    def upsert_many(
        self,
        rows: Iterable[tuple[str, str, str, str, str, dict[str, Any], np.ndarray]],
    ) -> int:
        """
        rows: (id, rel_path, language, kind, content, meta, embedding float32)
        """
        count = 0
        with self._connect() as conn:
            for (pid, rel_path, lang, kind, content, meta, emb) in rows:
                emb32 = np.asarray(emb, dtype=np.float32)
                conn.execute(
                    """
                    INSERT INTO patterns (id, rel_path, language, kind, content, meta_json, embedding, dim)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      rel_path=excluded.rel_path,
                      language=excluded.language,
                      kind=excluded.kind,
                      content=excluded.content,
                      meta_json=excluded.meta_json,
                      embedding=excluded.embedding,
                      dim=excluded.dim
                    """,
                    (
                        pid,
                        rel_path,
                        lang,
                        kind,
                        content,
                        json.dumps(meta, ensure_ascii=False, sort_keys=True),
                        emb32.tobytes(),
                        int(emb32.shape[0]),
                    ),
                )
                count += 1
        return count

    def iter_all(self) -> Iterable[StoredPattern]:
        with self._connect() as conn:
            cur = conn.execute("SELECT id, rel_path, language, kind, content, meta_json, embedding, dim FROM patterns")
            for (pid, rel_path, lang, kind, content, meta_json, blob, dim) in cur.fetchall():
                emb = np.frombuffer(blob, dtype=np.float32, count=int(dim))
                meta = json.loads(meta_json) if meta_json else {}
                yield StoredPattern(
                    id=pid,
                    rel_path=rel_path,
                    language=lang,
                    kind=kind,
                    content=content,
                    meta=meta,
                    embedding=emb,
                )

    def count(self) -> int:
        with self._connect() as conn:
            (n,) = conn.execute("SELECT COUNT(1) FROM patterns").fetchone()
            return int(n)

