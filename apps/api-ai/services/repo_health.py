from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List


DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class RepoHealthSignals:
    repo_root: Path

    # Docs / community
    has_readme: bool
    has_license: bool
    has_contributing: bool
    has_security_policy: bool
    has_codeowners: bool
    has_changelog: bool

    # CI / automation
    ci_workflow_count: int
    has_codeql: bool
    has_dependabot: bool

    # Testing / quality
    python_test_files: int
    node_test_files: int
    has_python_ci: bool
    has_node_ci: bool

    # Dependency hygiene
    has_package_json: bool
    has_node_lockfile: bool
    python_requirements_pinned_ratio: float  # 0..1

    # Ops / deploy
    has_docker_compose: bool
    has_env_example: bool


@dataclass(frozen=True)
class RepoHealthFinding:
    id: str
    title: str
    description: str
    category: str
    severity: str  # low|medium|high|critical
    priority_score: int  # 0..100
    suggested_fix: str
    evidence: Dict[str, Any]


@dataclass(frozen=True)
class RepoHealthReport:
    repo_root: str
    total_score: int  # 0..100
    category_scores: Dict[str, int]  # 0..100 each
    signals: Dict[str, Any]
    findings: List[RepoHealthFinding]


def _count_files(repo_root: Path, *, rel_globs: List[str]) -> int:
    total = 0
    for pattern in rel_globs:
        total += len(list(repo_root.glob(pattern)))
    return total


def _exists_any(repo_root: Path, rel_paths: List[str]) -> bool:
    return any((repo_root / p).exists() for p in rel_paths)


def _requirements_pinned_ratio(req_text: str) -> float:
    """
    Best-effort heuristic: count non-empty, non-comment requirements lines.
    A line is considered "pinned" if it contains ==, ~=, or ===.
    """
    lines = []
    for raw in req_text.splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith("-r") or s.startswith("--requirement"):
            # ignore includes (we can't resolve reliably here)
            continue
        if s.startswith("-e") or s.startswith("--editable"):
            # editable installs are not pinned in practice
            lines.append(("unpinned", s))
            continue
        lines.append(("line", s))

    if not lines:
        return 0.0

    pinned = 0
    considered = 0
    for _kind, s in lines:
        considered += 1
        if "===" in s or "==" in s or "~=" in s:
            pinned += 1

    return max(0.0, min(1.0, pinned / max(1, considered)))


def collect_repo_health_signals(repo_root: str | Path = DEFAULT_REPO_ROOT) -> RepoHealthSignals:
    root = Path(repo_root).resolve()

    # Docs / community
    has_readme = _exists_any(root, ["README.md", "readme.md", "README.rst"])
    has_license = _exists_any(root, ["LICENSE", "LICENSE.md", "LICENSE.txt"])
    has_contributing = _exists_any(root, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"])
    has_security_policy = _exists_any(root, ["SECURITY.md", ".github/SECURITY.md"])
    has_codeowners = _exists_any(root, [".github/CODEOWNERS", "CODEOWNERS"])
    has_changelog = _exists_any(root, ["CHANGELOG.md", "CHANGELOG"])

    # CI / automation
    ci_dir = root / ".github" / "workflows"
    ci_workflow_count = len(list(ci_dir.glob("*.yml"))) + len(list(ci_dir.glob("*.yaml"))) if ci_dir.exists() else 0
    has_codeql = _exists_any(root, [".github/workflows/codeql.yml", ".github/workflows/codeql.yaml"])
    has_dependabot = _exists_any(root, [".github/dependabot.yml", ".github/dependabot.yaml"])

    # Tests / quality
    python_test_files = _count_files(root, rel_globs=["apps/api-ai/tests/test_*.py", "tests/test_*.py"])
    node_test_files = _count_files(
        root,
        rel_globs=[
            "apps/**/tests/**/*.test.ts",
            "apps/**/tests/**/*.spec.ts",
            "apps/**/__tests__/**/*.ts",
            "apps/**/__tests__/**/*.tsx",
        ],
    )
    has_python_ci = _exists_any(root, [".github/workflows/python-ci.yml", ".github/workflows/python-ci.yaml"])
    has_node_ci = _exists_any(root, [".github/workflows/node.js.yml", ".github/workflows/node.js.yaml"])

    # Dependency hygiene
    has_package_json = (root / "package.json").exists()
    has_node_lockfile = _exists_any(root, ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"])
    req_path = root / "requirements.txt"
    python_requirements_pinned_ratio = 0.0
    if req_path.exists():
        try:
            python_requirements_pinned_ratio = _requirements_pinned_ratio(req_path.read_text(encoding="utf-8"))
        except Exception:
            python_requirements_pinned_ratio = 0.0

    # Ops / deploy
    has_docker_compose = (root / "docker-compose.yml").exists()
    has_env_example = (root / ".env.example").exists()

    return RepoHealthSignals(
        repo_root=root,
        has_readme=has_readme,
        has_license=has_license,
        has_contributing=has_contributing,
        has_security_policy=has_security_policy,
        has_codeowners=has_codeowners,
        has_changelog=has_changelog,
        ci_workflow_count=ci_workflow_count,
        has_codeql=has_codeql,
        has_dependabot=has_dependabot,
        python_test_files=python_test_files,
        node_test_files=node_test_files,
        has_python_ci=has_python_ci,
        has_node_ci=has_node_ci,
        has_package_json=has_package_json,
        has_node_lockfile=has_node_lockfile,
        python_requirements_pinned_ratio=python_requirements_pinned_ratio,
        has_docker_compose=has_docker_compose,
        has_env_example=has_env_example,
    )


def _severity_base(sev: str) -> int:
    return {
        "low": 20,
        "medium": 50,
        "high": 80,
        "critical": 100,
    }.get(sev, 50)


def _clamp_int(n: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(n))))


def _weighted_total(category_scores: Dict[str, int], weights: Dict[str, float]) -> int:
    tot_w = sum(weights.values()) or 1.0
    s = 0.0
    for k, w in weights.items():
        s += (category_scores.get(k, 0) / 100.0) * w
    return _clamp_int((s / tot_w) * 100.0)


def _make_finding(
    *,
    fid: str,
    title: str,
    description: str,
    category: str,
    severity: str,
    impact_weight: float,
    confidence: float,
    suggested_fix: str,
    evidence: Dict[str, Any],
) -> RepoHealthFinding:
    base = _severity_base(severity)
    priority = _clamp_int(base * impact_weight * confidence)
    return RepoHealthFinding(
        id=fid,
        title=title,
        description=description,
        category=category,
        severity=severity,
        priority_score=priority,
        suggested_fix=suggested_fix,
        evidence=evidence,
    )


def score_repo_health(signals: RepoHealthSignals) -> RepoHealthReport:
    """
    Produce a deterministic 0..100 score and a prioritized findings list.

    The score is category-based; findings are derived from missing/weak signals.
    """
    findings: List[RepoHealthFinding] = []

    # Category weights (sum doesn't matter; we normalize)
    weights = {
        "docs": 12.0,
        "ci": 18.0,
        "security": 18.0,
        "tests": 22.0,
        "dependencies": 18.0,
        "ops": 12.0,
    }

    # --- docs
    docs_points = 0
    docs_points += 25 if signals.has_readme else 0
    docs_points += 20 if signals.has_license else 0
    docs_points += 15 if signals.has_contributing else 0
    docs_points += 20 if signals.has_security_policy else 0
    docs_points += 10 if signals.has_codeowners else 0
    docs_points += 10 if signals.has_changelog else 0
    docs_score = _clamp_int(docs_points)

    if not signals.has_license:
        findings.append(
            _make_finding(
                fid="docs.missing_license",
                title="Missing LICENSE file",
                description="A license clarifies usage rights and reduces friction for contributors/users.",
                category="docs",
                severity="medium",
                impact_weight=0.9,
                confidence=0.9,
                suggested_fix="Add a LICENSE (e.g., MIT/Apache-2.0) at repo root.",
                evidence={"expected_paths": ["LICENSE", "LICENSE.md", "LICENSE.txt"]},
            )
        )
    if not signals.has_contributing:
        findings.append(
            _make_finding(
                fid="docs.missing_contributing",
                title="Missing CONTRIBUTING guidelines",
                description="Contribution guidelines reduce maintainer load and standardize PR/issue quality.",
                category="docs",
                severity="low",
                impact_weight=0.6,
                confidence=0.85,
                suggested_fix="Add CONTRIBUTING.md with setup, tests, lint, PR checklist.",
                evidence={"expected_paths": ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]},
            )
        )
    if not signals.has_security_policy:
        findings.append(
            _make_finding(
                fid="docs.missing_security_policy",
                title="Missing SECURITY policy",
                description="A SECURITY.md establishes how to report vulnerabilities responsibly.",
                category="security",
                severity="medium",
                impact_weight=0.8,
                confidence=0.85,
                suggested_fix="Add SECURITY.md with disclosure process and contact.",
                evidence={"expected_paths": ["SECURITY.md", ".github/SECURITY.md"]},
            )
        )

    # --- ci
    ci_points = 0
    ci_points += 30 if signals.ci_workflow_count >= 1 else 0
    ci_points += 20 if signals.ci_workflow_count >= 3 else 0
    ci_points += 25 if signals.has_node_ci else 0
    ci_points += 25 if signals.has_python_ci else 0
    ci_score = _clamp_int(ci_points)

    if signals.ci_workflow_count == 0:
        findings.append(
            _make_finding(
                fid="ci.missing_workflows",
                title="No CI workflows detected",
                description="CI prevents regressions and enforces consistent quality gates.",
                category="ci",
                severity="high",
                impact_weight=1.0,
                confidence=0.95,
                suggested_fix="Add GitHub Actions workflows for lint/test/build on PRs.",
                evidence={"workflow_dir": ".github/workflows"},
            )
        )

    # --- security
    security_points = 0
    security_points += 50 if signals.has_codeql else 0
    security_points += 50 if signals.has_dependabot else 0
    security_score = _clamp_int(security_points)

    if not signals.has_dependabot and signals.has_package_json:
        findings.append(
            _make_finding(
                fid="security.missing_dependabot",
                title="Dependabot not configured",
                description="Automated dependency update PRs reduce exposure to known vulnerabilities.",
                category="security",
                severity="medium",
                impact_weight=0.9,
                confidence=0.85,
                suggested_fix="Add .github/dependabot.yml for npm and pip ecosystems.",
                evidence={"expected_paths": [".github/dependabot.yml", ".github/dependabot.yaml"]},
            )
        )

    # --- tests
    # Heuristic: at least a few tests in both ecosystems
    tests_points = 0
    tests_points += 40 if signals.python_test_files >= 1 else 0
    tests_points += 20 if signals.python_test_files >= 5 else 0
    tests_points += 30 if signals.node_test_files >= 1 else 0
    tests_points += 10 if signals.node_test_files >= 10 else 0
    tests_score = _clamp_int(tests_points)

    if signals.node_test_files == 0 and signals.has_package_json:
        findings.append(
            _make_finding(
                fid="tests.missing_node_tests",
                title="No Node/TS tests detected",
                description="Lack of automated tests increases regression risk for the control plane and web UI.",
                category="tests",
                severity="high",
                impact_weight=1.0,
                confidence=0.9,
                suggested_fix="Add unit tests for critical services/controllers (Jest) and basic Next.js component tests.",
                evidence={"node_test_files": signals.node_test_files},
            )
        )

    # --- dependencies
    dep_points = 0
    if signals.has_package_json:
        dep_points += 40
        dep_points += 40 if signals.has_node_lockfile else 0
    else:
        dep_points += 0
    dep_points += _clamp_int(signals.python_requirements_pinned_ratio * 20.0)
    dep_score = _clamp_int(dep_points)

    if signals.has_package_json and not signals.has_node_lockfile:
        findings.append(
            _make_finding(
                fid="deps.missing_lockfile",
                title="No Node lockfile committed",
                description="Without a lockfile, installs are non-deterministic and CI/prod can drift over time.",
                category="dependencies",
                severity="high",
                impact_weight=1.0,
                confidence=0.95,
                suggested_fix="Commit a lockfile (package-lock.json / pnpm-lock.yaml / yarn.lock) for reproducible installs.",
                evidence={"has_package_json": True, "has_node_lockfile": False},
            )
        )

    if (signals.python_requirements_pinned_ratio > 0.0) and (signals.python_requirements_pinned_ratio < 0.8):
        findings.append(
            _make_finding(
                fid="deps.unpinned_python_requirements",
                title="Python requirements are not consistently pinned",
                description="Unpinned deps increase breakage risk and make incident response harder.",
                category="dependencies",
                severity="medium",
                impact_weight=0.8,
                confidence=0.8,
                suggested_fix="Pin Python dependencies (or adopt constraints/lock via pip-tools/uv/poetry).",
                evidence={"pinned_ratio": signals.python_requirements_pinned_ratio},
            )
        )

    # --- ops
    ops_points = 0
    ops_points += 50 if signals.has_docker_compose else 0
    ops_points += 50 if signals.has_env_example else 0
    ops_score = _clamp_int(ops_points)

    if not signals.has_env_example:
        findings.append(
            _make_finding(
                fid="ops.missing_env_example",
                title="Missing .env.example",
                description="An .env.example accelerates onboarding and reduces misconfiguration.",
                category="ops",
                severity="low",
                impact_weight=0.6,
                confidence=0.9,
                suggested_fix="Add .env.example documenting required/optional variables.",
                evidence={"expected_path": ".env.example"},
            )
        )

    category_scores = {
        "docs": docs_score,
        "ci": ci_score,
        "security": security_score,
        "tests": tests_score,
        "dependencies": dep_score,
        "ops": ops_score,
    }

    total = _weighted_total(category_scores, weights)

    # Sort findings by priority then stable tie-breakers
    findings_sorted = sorted(
        findings,
        key=lambda f: (
            -f.priority_score,
            {"critical": 0, "high": 1, "medium": 2, "low": 3}.get(f.severity, 9),
            f.category,
            f.id,
        ),
    )

    signals_dict = {
        "repo_root": str(signals.repo_root),
        "has_readme": signals.has_readme,
        "has_license": signals.has_license,
        "has_contributing": signals.has_contributing,
        "has_security_policy": signals.has_security_policy,
        "has_codeowners": signals.has_codeowners,
        "has_changelog": signals.has_changelog,
        "ci_workflow_count": signals.ci_workflow_count,
        "has_codeql": signals.has_codeql,
        "has_dependabot": signals.has_dependabot,
        "python_test_files": signals.python_test_files,
        "node_test_files": signals.node_test_files,
        "has_python_ci": signals.has_python_ci,
        "has_node_ci": signals.has_node_ci,
        "has_package_json": signals.has_package_json,
        "has_node_lockfile": signals.has_node_lockfile,
        "python_requirements_pinned_ratio": signals.python_requirements_pinned_ratio,
        "has_docker_compose": signals.has_docker_compose,
        "has_env_example": signals.has_env_example,
        "cwd": os.getcwd(),
    }

    return RepoHealthReport(
        repo_root=str(signals.repo_root),
        total_score=total,
        category_scores=category_scores,
        signals=signals_dict,
        findings=findings_sorted,
    )


def compute_repo_health(repo_root: str | Path = DEFAULT_REPO_ROOT) -> RepoHealthReport:
    return score_repo_health(collect_repo_health_signals(repo_root))

