from pathlib import Path

from services.repo_health import compute_repo_health


def _write(p: Path, content: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")


def test_repo_health_prioritizes_lockfile_when_missing(tmp_path: Path):
    # Minimal synthetic repo
    _write(tmp_path / "README.md", "# test\n")
    _write(tmp_path / "package.json", '{"name":"x","private":true,"version":"0.0.0"}\n')
    _write(tmp_path / "requirements.txt", "fastapi==0.110.0\nuvicorn==0.27.0\n")
    _write(tmp_path / ".github/workflows/node.js.yml", "name: node\non: [push]\n")
    _write(tmp_path / ".github/workflows/python-ci.yml", "name: py\non: [push]\n")

    report = compute_repo_health(tmp_path)
    ids = [f.id for f in report.findings]

    assert "deps.missing_lockfile" in ids
    assert ids[0] == "deps.missing_lockfile"  # highest priority in this synthetic setup


def test_repo_health_removes_lockfile_finding_when_present(tmp_path: Path):
    _write(tmp_path / "README.md", "# test\n")
    _write(tmp_path / "package.json", '{"name":"x","private":true,"version":"0.0.0"}\n')
    _write(tmp_path / "package-lock.json", '{"name":"x","lockfileVersion":3}\n')
    _write(tmp_path / "requirements.txt", "fastapi==0.110.0\n")
    _write(tmp_path / ".github/workflows/node.js.yml", "name: node\non: [push]\n")

    report = compute_repo_health(tmp_path)
    ids = [f.id for f in report.findings]
    assert "deps.missing_lockfile" not in ids

