from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class CmdResult:
    exit_code: int
    duration_ms: int
    stdout: str
    stderr: str
    timed_out: bool = False


def which(tool: str) -> Optional[str]:
    return shutil.which(tool)


def run_cmd(
    command: str,
    *,
    cwd: str | Path,
    timeout_sec: int,
    env: Optional[dict[str, str]] = None,
    max_output_chars: int = 200_000,
) -> CmdResult:
    started = time.time()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    try:
        p = subprocess.run(
            command,
            cwd=str(cwd),
            shell=True,
            text=True,
            capture_output=True,
            timeout=timeout_sec,
            env=merged_env,
        )
        stdout = (p.stdout or "")[:max_output_chars]
        stderr = (p.stderr or "")[:max_output_chars]
        return CmdResult(
            exit_code=int(p.returncode),
            duration_ms=int((time.time() - started) * 1000),
            stdout=stdout,
            stderr=stderr,
            timed_out=False,
        )
    except subprocess.TimeoutExpired as e:
        stdout = ((e.stdout or "") if isinstance(e.stdout, str) else "")[:max_output_chars]
        stderr = ((e.stderr or "") if isinstance(e.stderr, str) else "")[:max_output_chars]
        return CmdResult(
            exit_code=124,
            duration_ms=int((time.time() - started) * 1000),
            stdout=stdout,
            stderr=stderr,
            timed_out=True,
        )

