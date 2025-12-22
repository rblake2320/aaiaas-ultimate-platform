from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class CommandResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str


async def run_cmd(
    command: list[str],
    *,
    cwd: str | None = None,
    timeout_seconds: int = 120,
) -> CommandResult:
    proc = await asyncio.create_subprocess_exec(
        *command,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        proc.kill()
        out_b, err_b = await proc.communicate()
        return CommandResult(command=command, returncode=124, stdout=out_b.decode(), stderr=err_b.decode())

    return CommandResult(
        command=command,
        returncode=int(proc.returncode or 0),
        stdout=out_b.decode(errors="replace"),
        stderr=err_b.decode(errors="replace"),
    )

