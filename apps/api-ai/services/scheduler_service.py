import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class SchedulerConfig:
    enabled: bool = _env_bool("SCHEDULER_ENABLED", False)
    heartbeat_seconds: int = _env_int("SCHEDULER_HEARTBEAT_SECONDS", 60)
    tmp_cleanup_enabled: bool = _env_bool("SCHEDULER_TMP_CLEANUP_ENABLED", False)
    tmp_cleanup_dir: str = os.getenv("SCHEDULER_TMP_CLEANUP_DIR", "/tmp")
    tmp_max_age_seconds: int = _env_int("SCHEDULER_TMP_MAX_AGE_SECONDS", 24 * 60 * 60)
    tmp_cleanup_interval_seconds: int = _env_int("SCHEDULER_TMP_CLEANUP_INTERVAL_SECONDS", 60 * 60)


def _heartbeat() -> None:
    logger.info("scheduler heartbeat")


def _cleanup_tmp_dir(dir_path: str, max_age_seconds: int) -> None:
    """
    Best-effort cleanup of old files in a configured directory.
    Keeps this deliberately conservative (no recursion, files only).
    """
    now = time.time()
    root = Path(dir_path)
    if not root.exists() or not root.is_dir():
        return

    removed = 0
    for p in root.iterdir():
        try:
            if not p.is_file():
                continue
            st = p.stat()
            if (now - st.st_mtime) >= max_age_seconds:
                p.unlink(missing_ok=True)
                removed += 1
        except Exception:
            # Never let cleanup break the scheduler.
            logger.debug("tmp cleanup failed for %s", str(p), exc_info=True)

    if removed:
        logger.info("scheduler tmp cleanup removed=%s dir=%s", removed, str(root))


def _get_existing_scheduler(app) -> Optional[AsyncIOScheduler]:
    return getattr(getattr(app, "state", None), "scheduler", None)


def start_scheduler(app) -> None:
    """
    Starts an in-process scheduler.

    NOTE: Run this only with a single process/worker. If you scale uvicorn/gunicorn
    to multiple workers, each worker would start its own scheduler and jobs would
    execute multiple times. For distributed scheduling, use Celery Beat (or a
    dedicated scheduler service).
    """
    cfg = SchedulerConfig()
    if not cfg.enabled:
        logger.info("scheduler disabled (SCHEDULER_ENABLED=false)")
        return

    if _get_existing_scheduler(app) is not None:
        # Guard against double-start in unusual reload scenarios.
        logger.info("scheduler already started")
        return

    scheduler = AsyncIOScheduler(timezone="UTC")

    # Lightweight heartbeat so we can tell it's running.
    scheduler.add_job(
        _heartbeat,
        trigger=IntervalTrigger(seconds=max(5, cfg.heartbeat_seconds)),
        id="heartbeat",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    if cfg.tmp_cleanup_enabled:
        scheduler.add_job(
            _cleanup_tmp_dir,
            trigger=IntervalTrigger(seconds=max(60, cfg.tmp_cleanup_interval_seconds)),
            id="tmp_cleanup",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            kwargs={
                "dir_path": cfg.tmp_cleanup_dir,
                "max_age_seconds": max(60, cfg.tmp_max_age_seconds),
            },
        )

    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("scheduler started")


def shutdown_scheduler(app) -> None:
    scheduler = _get_existing_scheduler(app)
    if scheduler is None:
        return
    try:
        scheduler.shutdown(wait=False)
    finally:
        app.state.scheduler = None
    logger.info("scheduler stopped")

