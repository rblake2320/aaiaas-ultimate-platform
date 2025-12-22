from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class Pattern:
    """
    A "pattern" is a chunk of code or style signal extracted from a file.
    """

    id: str
    file_path: str
    rel_path: str
    language: str
    kind: str
    content: str
    meta: dict[str, Any]

    def meta_json(self) -> str:
        return json.dumps(self.meta, ensure_ascii=False, sort_keys=True)


_PY_DEF = re.compile(r"^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", re.M)
_PY_CLASS = re.compile(r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[\(:]", re.M)
_JS_FUNC = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(", re.M)
_JS_CLASS = re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[{]", re.M)
_IMPORT = re.compile(r"^\s*(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))", re.M)


def _lang_from_path(rel_path: str) -> str:
    low = rel_path.lower()
    if low.endswith(".py"):
        return "python"
    if low.endswith(".ts") or low.endswith(".tsx"):
        return "typescript"
    if low.endswith(".js") or low.endswith(".jsx"):
        return "javascript"
    if low.endswith(".go"):
        return "go"
    if low.endswith(".rs"):
        return "rust"
    if low.endswith(".java"):
        return "java"
    if low.endswith(".sql"):
        return "sql"
    if low.endswith(".md"):
        return "markdown"
    if low.endswith(".yml") or low.endswith(".yaml"):
        return "yaml"
    if low.endswith(".json"):
        return "json"
    if low.endswith(".toml"):
        return "toml"
    if low.endswith(".sh"):
        return "shell"
    if low.endswith("dockerfile"):
        return "dockerfile"
    return "text"


def _make_id(rel_path: str, kind: str, idx: int) -> str:
    return f"{rel_path}:{kind}:{idx}"


def extract_patterns(
    *,
    file_path: str,
    rel_path: str,
    text: str,
    max_chunk_chars: int = 2000,
) -> Iterable[Pattern]:
    """
    Heuristic pattern extractor:
    - Captures function/class definitions for Python/JS/TS
    - Captures import blocks
    - Captures top-of-file "style" header snippet
    """
    language = _lang_from_path(rel_path)

    # Always include a header snippet as a style signal
    header = text[: max_chunk_chars].strip()
    if header:
        yield Pattern(
            id=_make_id(rel_path, "header", 0),
            file_path=file_path,
            rel_path=rel_path,
            language=language,
            kind="header",
            content=header,
            meta={"chars": len(header)},
        )

    # Imports (first N lines)
    lines = text.splitlines()
    import_lines = []
    for ln in lines[:200]:
        if _IMPORT.search(ln):
            import_lines.append(ln.rstrip())
    if import_lines:
        block = "\n".join(import_lines)[:max_chunk_chars].strip()
        yield Pattern(
            id=_make_id(rel_path, "imports", 0),
            file_path=file_path,
            rel_path=rel_path,
            language=language,
            kind="imports",
            content=block,
            meta={"lines": len(import_lines)},
        )

    # Symbol matches
    symbols: list[tuple[str, str]] = []
    if language == "python":
        symbols += [("def", m.group(1)) for m in _PY_DEF.finditer(text)]
        symbols += [("class", m.group(1)) for m in _PY_CLASS.finditer(text)]
    if language in {"javascript", "typescript"}:
        symbols += [("function", m.group(1)) for m in _JS_FUNC.finditer(text)]
        symbols += [("class", m.group(1)) for m in _JS_CLASS.finditer(text)]

    # Emit symbol-centered chunks
    for i, (sym_kind, name) in enumerate(symbols[:200]):
        # find the first occurrence line index to center around
        needle = name
        pos = text.find(needle)
        if pos < 0:
            continue
        start = max(0, pos - (max_chunk_chars // 2))
        end = min(len(text), start + max_chunk_chars)
        chunk = text[start:end].strip()
        if not chunk:
            continue
        yield Pattern(
            id=_make_id(rel_path, f"{sym_kind}", i),
            file_path=file_path,
            rel_path=rel_path,
            language=language,
            kind=sym_kind,
            content=chunk,
            meta={"symbol": name, "chars": len(chunk)},
        )

