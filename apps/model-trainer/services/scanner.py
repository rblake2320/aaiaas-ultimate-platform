from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_IGNORE_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".idea",
    ".vscode",
    "coverage",
}

DEFAULT_CODE_EXTS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".cs",
    ".sql",
    ".md",
    ".yml",
    ".yaml",
    ".toml",
    ".json",
    ".sh",
    ".dockerfile",
    "Dockerfile",
}


@dataclass(frozen=True)
class ScannedFile:
    path: str
    rel_path: str
    size_bytes: int


def _is_ignored_dir(dir_name: str) -> bool:
    return dir_name in DEFAULT_IGNORE_DIRS


def iter_code_files(root: str, max_file_bytes: int = 2_000_000) -> Iterable[ScannedFile]:
    """
    Recursively iterate "code-ish" files under root.
    """
    root_path = Path(root).resolve()
    for dirpath, dirnames, filenames in os.walk(root_path):
        # prune ignored dirs
        dirnames[:] = [d for d in dirnames if not _is_ignored_dir(d)]

        for name in filenames:
            p = Path(dirpath) / name
            try:
                st = p.stat()
            except OSError:
                continue

            if st.st_size <= 0 or st.st_size > max_file_bytes:
                continue

            ext = p.suffix.lower()
            if name == "Dockerfile" or ext in DEFAULT_CODE_EXTS:
                rel = str(p.relative_to(root_path))
                yield ScannedFile(path=str(p), rel_path=rel, size_bytes=st.st_size)

