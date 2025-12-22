/**
 * Codebase Monitoring Scanner (dependency-free)
 *
 * Scans the repo for:
 * - Likely leaked secrets / private keys (HIGH)
 * - High-risk APIs and patterns (MEDIUM)
 * - Work-in-progress markers (LOW)
 * - Committed `.env` files or key material files (HIGH)
 *
 * Usage:
 *   node scripts/codebase-monitor.js
 *   node scripts/codebase-monitor.js --out reports/codebase-monitor-report.json
 *   node scripts/codebase-monitor.js --fail-on high,medium
 */
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  maxFileSizeBytes: 1024 * 1024, // 1 MiB
  ignoreDirs: [
    ".git",
    "node_modules",
    "reports",
    ".next",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
  ],
  ignoreFiles: [
    // Large / generated files that can be noisy
    "package-lock.json", // ok to scan optionally, but defaults to skip
  ],
  includeExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".yml",
    ".yaml",
    ".md",
    ".sh",
    ".sql",
    ".py",
    ".env",
    ".txt",
  ],
  // If a file path contains any of these segments, findings are ignored
  allowlistPathContains: [".env.example"],
  failOn: ["high"],
};

function parseArgs(argv) {
  const args = { out: null, format: "json", failOn: null, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      args.out = argv[i + 1] || null;
      i++;
      continue;
    }
    if (a === "--format") {
      args.format = argv[i + 1] || "json";
      i++;
      continue;
    }
    if (a === "--fail-on") {
      args.failOn = (argv[i + 1] || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      i++;
      continue;
    }
    if (a === "--quiet" || a === "-q") {
      args.quiet = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      args.help = true;
    }
  }
  return args;
}

async function fileExists(p) {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(p) {
  if (!(await fileExists(p))) return null;
  const raw = await fs.promises.readFile(p, "utf8");
  return JSON.parse(raw);
}

function nowIso() {
  return new Date().toISOString();
}

function ensurePosix(p) {
  return p.split(path.sep).join("/");
}

function shouldIgnorePath(absPath, repoRoot, config) {
  const rel = ensurePosix(path.relative(repoRoot, absPath));
  const parts = rel.split("/");
  if (!rel || rel.startsWith("..")) return true;

  // ignore any matching directory segment (including the entry itself)
  for (const part of parts) {
    if (config.ignoreDirs.includes(part)) return true;
  }

  const base = parts[parts.length - 1];
  if (config.ignoreFiles.includes(base)) return true;

  return false;
}

function isBinaryLikely(buffer) {
  // Heuristic: if there are many NUL bytes, treat as binary
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  return nul > 0;
}

function splitLines(text) {
  // Keep it simple; line endings normalized for matching
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function getLineColumn(lines, lineIdx, matchIdxInLine) {
  return { line: lineIdx + 1, column: matchIdxInLine + 1 };
}

function excerptFromLine(line, start, end, maxLen = 180) {
  const s = Math.max(0, start - 40);
  const e = Math.min(line.length, end + 40);
  let ex = line.slice(s, e);
  if (s > 0) ex = `…${ex}`;
  if (e < line.length) ex = `${ex}…`;
  if (ex.length > maxLen) ex = ex.slice(0, maxLen - 1) + "…";
  return ex;
}

function makeRule({
  id,
  severity,
  message,
  extensions,
  regex,
  flags,
  excludeExtensions,
  ignoreInPathsContaining,
}) {
  const re = new RegExp(regex, flags || "g");
  return {
    id,
    severity,
    message,
    extensions: extensions ? new Set(extensions) : null,
    excludeExtensions: excludeExtensions ? new Set(excludeExtensions) : null,
    ignoreInPathsContaining: ignoreInPathsContaining || [],
    re,
  };
}

function getRules() {
  return [
    // HIGH: key material
    makeRule({
      id: "private-key-block",
      severity: "high",
      message: "Private key material detected",
      extensions: null, // any text file
      regex:
        "-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----|-----BEGIN PRIVATE KEY-----",
      flags: "g",
      // Avoid self-matching the scanner's own signature patterns.
      ignoreInPathsContaining: ["scripts/codebase-monitor.js"],
    }),
    // HIGH: common API keys/tokens
    makeRule({
      id: "github-token",
      severity: "high",
      message: "GitHub token pattern detected",
      regex: "\\bghp_[A-Za-z0-9]{36}\\b|\\bgithub_pat_[A-Za-z0-9_]{20,}\\b",
      flags: "g",
    }),
    makeRule({
      id: "aws-access-key-id",
      severity: "high",
      message: "AWS access key id pattern detected",
      regex: "\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b",
      flags: "g",
    }),
    makeRule({
      id: "slack-token",
      severity: "high",
      message: "Slack token pattern detected",
      regex: "\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b",
      flags: "g",
    }),
    makeRule({
      id: "stripe-live-key",
      severity: "high",
      message: "Stripe live secret key pattern detected",
      regex: "\\b(?:sk_live|rk_live)_[A-Za-z0-9]{16,}\\b",
      flags: "g",
    }),
    makeRule({
      id: "openai-api-key",
      severity: "high",
      message: "OpenAI API key pattern detected",
      regex: "\\bsk-[A-Za-z0-9]{20,}\\b",
      flags: "g",
      // Keys often appear in docs as examples; still worth flagging unless allowlisted.
      ignoreInPathsContaining: [],
    }),

    // MEDIUM: risky JS APIs
    makeRule({
      id: "js-eval",
      severity: "medium",
      message: "Use of eval/Function can be dangerous",
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
      regex: "\\beval\\s*\\(|\\bnew\\s+Function\\s*\\(",
      flags: "g",
    }),
    makeRule({
      id: "node-child-process-exec",
      severity: "medium",
      message: "child_process exec/execSync can be injection-prone; prefer execFile/spawn with args",
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
      regex: "\\bchild_process\\.(?:exec|execSync)\\s*\\(|\\brequire\\(['\"]child_process['\"]\\)\\.(?:exec|execSync)\\s*\\(",
      flags: "g",
    }),

    // MEDIUM: risky Python patterns
    makeRule({
      id: "py-shell-true",
      severity: "medium",
      message: "Python subprocess with shell=True can be injection-prone",
      extensions: [".py"],
      regex: "\\bshell\\s*=\\s*True\\b",
      flags: "g",
    }),
    makeRule({
      id: "py-pickle-loads",
      severity: "medium",
      message: "pickle.loads is unsafe for untrusted data",
      extensions: [".py"],
      regex: "\\bpickle\\.(?:loads|load)\\s*\\(",
      flags: "g",
    }),
    makeRule({
      id: "py-yaml-load",
      severity: "medium",
      message: "yaml.load without SafeLoader can be unsafe; prefer yaml.safe_load",
      extensions: [".py"],
      regex: "\\byaml\\.load\\s*\\(",
      flags: "g",
    }),

    // LOW: hygiene markers
    makeRule({
      id: "todo-fixme",
      severity: "low",
      message: "Work marker found",
      extensions: null,
      regex: "\\b(?:TODO|FIXME|HACK|XXX)\\b",
      flags: "g",
    }),
  ];
}

function severityRank(s) {
  if (s === "high") return 3;
  if (s === "medium") return 2;
  if (s === "low") return 1;
  return 0;
}

function shouldAllowlist(relPath, config) {
  return config.allowlistPathContains.some((seg) => relPath.includes(seg));
}

async function walkAndScan(repoRoot, dirAbs, config, rules, acc) {
  const entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dirAbs, ent.name);
    if (shouldIgnorePath(abs, repoRoot, config)) continue;

    if (ent.isDirectory()) {
      await walkAndScan(repoRoot, abs, config, rules, acc);
      continue;
    }

    if (!ent.isFile()) continue;
    acc.totalFilesEnumerated++;

    const res = await scanFile(abs, repoRoot, config, rules);
    if (res.scanned) acc.scannedFiles++;
    if (res.skippedReason) {
      acc.skipped[res.skippedReason] = (acc.skipped[res.skippedReason] || 0) + 1;
    }

    for (const w of res.warnings) {
      acc.warningCount++;
      if (acc.warnings.length < acc.maxStoredWarnings) acc.warnings.push(w);
      else acc.warningsTruncated = true;
    }

    for (const f of res.findings) {
      acc.findingsCountBySeverity[f.severity] =
        (acc.findingsCountBySeverity[f.severity] || 0) + 1;

      // Prefer storing high+medium findings; low findings are capped to avoid memory blow-ups.
      const store =
        acc.findings.length < acc.maxStoredFindings &&
        (f.severity !== "low" || acc.lowFindingsStored < acc.maxStoredLowFindings);

      if (store) {
        acc.findings.push(f);
        if (f.severity === "low") acc.lowFindingsStored++;
      } else {
        acc.findingsTruncated = true;
      }
    }
  }
}

async function scanFile(absPath, repoRoot, config, rules) {
  const rel = ensurePosix(path.relative(repoRoot, absPath));
  const base = path.basename(absPath);
  const ext = path.extname(base).toLowerCase();

  // File-name based checks (no content needed)
  const findings = [];
  const warnings = [];

  // Committed .env check
  if (base === ".env") {
    findings.push({
      severity: "high",
      ruleId: "env-file-committed",
      message: "Committed .env file detected (should not be checked in)",
      file: rel,
      line: 1,
      column: 1,
      excerpt: ".env",
    });
  }

  // Key material file types (heuristic)
  const keyLikeExts = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".der"]);
  if (keyLikeExts.has(ext) || base.toLowerCase().includes("id_rsa")) {
    findings.push({
      severity: "high",
      ruleId: "key-material-file",
      message: "Possible key/certificate file committed",
      file: rel,
      line: 1,
      column: 1,
      excerpt: base,
    });
  }

  const shouldRead =
    config.includeExtensions.includes(ext) || base === ".env" || ext === "";
  if (!shouldRead) return { findings, warnings, scanned: false, skippedReason: "extension" };

  let st;
  try {
    st = await fs.promises.stat(absPath);
  } catch (e) {
    return {
      findings,
      warnings: warnings.concat([
        { message: `Could not stat file: ${String(e)}`, file: rel },
      ]),
      scanned: false,
      skippedReason: "stat_failed",
    };
  }
  if (st.size > config.maxFileSizeBytes) {
    return { findings, warnings, scanned: false, skippedReason: "too_large" };
  }

  let buf;
  try {
    buf = await fs.promises.readFile(absPath);
  } catch (e) {
    return {
      findings,
      warnings: warnings.concat([
        { message: `Could not read file: ${String(e)}`, file: rel },
      ]),
      scanned: false,
      skippedReason: "read_failed",
    };
  }
  if (isBinaryLikely(buf)) {
    return { findings, warnings, scanned: false, skippedReason: "binary" };
  }

  const text = buf.toString("utf8");
  const lines = splitLines(text);

  const allowlisted = shouldAllowlist(rel, config);

  for (const rule of rules) {
    if (rule.ignoreInPathsContaining.some((seg) => rel.includes(seg))) continue;
    if (rule.extensions && !rule.extensions.has(ext)) continue;
    if (rule.excludeExtensions && rule.excludeExtensions.has(ext)) continue;

    // reset lastIndex for global regex reuse
    rule.re.lastIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        if (allowlisted && rule.severity === "high") {
          // Example/env placeholder paths are often safe; still record as warning for visibility.
          warnings.push({
            message: `Allowlisted path matched high-severity rule ${rule.id}`,
            file: rel,
          });
          break;
        }

        const { line: lineNo, column } = getLineColumn(lines, i, m.index);
        findings.push({
          severity: rule.severity,
          ruleId: rule.id,
          message: rule.message,
          file: rel,
          line: lineNo,
          column,
          excerpt: excerptFromLine(line, m.index, m.index + (m[0] || "").length),
        });

        // Guard against regexes that can match empty strings and never advance.
        if (m[0] === "") {
          rule.re.lastIndex++;
          if (rule.re.lastIndex > line.length) break;
        }
      }
    }
  }

  return { findings, warnings, scanned: true, skippedReason: null };
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(
      [
        "Usage: node scripts/codebase-monitor.js [--out <path>] [--format json|text] [--fail-on high,medium,low] [--quiet]",
        "",
        "Defaults:",
        "  --format json",
        "  --fail-on high",
      ].join("\n")
    );
    process.exit(0);
  }

  const repoRoot = path.resolve(__dirname, "..");
  const configPath = path.join(repoRoot, "codebase-monitor.config.json");
  const fileConfig = (await readJsonIfExists(configPath)) || {};
  const config = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ignoreDirs: [...DEFAULT_CONFIG.ignoreDirs, ...(fileConfig.ignoreDirs || [])],
    ignoreFiles: [...DEFAULT_CONFIG.ignoreFiles, ...(fileConfig.ignoreFiles || [])],
    includeExtensions: [
      ...new Set([...DEFAULT_CONFIG.includeExtensions, ...(fileConfig.includeExtensions || [])]),
    ],
    allowlistPathContains: [
      ...new Set([
        ...DEFAULT_CONFIG.allowlistPathContains,
        ...(fileConfig.allowlistPathContains || []),
      ]),
    ],
  };

  const failOn = args.failOn && args.failOn.length ? args.failOn : config.failOn;
  const rules = getRules();

  const acc = {
    scannedFiles: 0,
    totalFilesEnumerated: 0,
    skipped: { extension: 0, too_large: 0, binary: 0, stat_failed: 0, read_failed: 0 },
    findings: [],
    findingsTruncated: false,
    lowFindingsStored: 0,
    findingsCountBySeverity: { high: 0, medium: 0, low: 0 },
    warnings: [],
    warningCount: 0,
    warningsTruncated: false,
    maxStoredFindings: typeof config.maxStoredFindings === "number" ? config.maxStoredFindings : 5000,
    maxStoredLowFindings:
      typeof config.maxStoredLowFindings === "number" ? config.maxStoredLowFindings : 2000,
    maxStoredWarnings: typeof config.maxStoredWarnings === "number" ? config.maxStoredWarnings : 1000,
  };

  // Simple lockfile presence check
  const lockFiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
  const hasAnyLock = await Promise.all(
    lockFiles.map(async (f) => fileExists(path.join(repoRoot, f)))
  ).then((arr) => arr.some(Boolean));
  if (!hasAnyLock) {
    acc.warningCount++;
    acc.warnings.push({
      message:
        "No JS lockfile found at repo root (package-lock.json / pnpm-lock.yaml / yarn.lock). Dependency drift reduces auditability.",
      file: "(repo)",
    });
  }

  await walkAndScan(repoRoot, repoRoot, config, rules, acc);

  acc.findings.sort((a, b) => {
    const sr = severityRank(b.severity) - severityRank(a.severity);
    if (sr !== 0) return sr;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return (a.line || 0) - (b.line || 0);
  });

  const findingsBySeverity = {
    high: acc.findingsCountBySeverity.high || 0,
    medium: acc.findingsCountBySeverity.medium || 0,
    low: acc.findingsCountBySeverity.low || 0,
  };

  const finishedAt = Date.now();
  const report = {
    meta: {
      tool: "codebase-monitor",
      version: "1.0.0",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
    },
    summary: {
      scannedFiles: acc.scannedFiles,
      totalFilesEnumerated: acc.totalFilesEnumerated,
      skipped: acc.skipped,
      findingsBySeverity,
      findingsTruncated: acc.findingsTruncated,
      warningsTruncated: acc.warningsTruncated,
      failOn,
    },
    findings: acc.findings,
    warnings: acc.warnings,
  };

  const shouldFail = ["high", "medium", "low"].some(
    (sev) => failOn.includes(sev) && (acc.findingsCountBySeverity[sev] || 0) > 0
  );

  if (args.quiet) {
    console.log(
      [
        `Codebase monitor finished at ${nowIso()}`,
        `Scanned files: ${report.summary.scannedFiles} (of ${report.summary.totalFilesEnumerated})`,
        `Findings: high=${findingsBySeverity.high} medium=${findingsBySeverity.medium} low=${findingsBySeverity.low}`,
        `Warnings: ${acc.warningCount}`,
        `Fail-on: ${failOn.join(",")}`,
        `Exit: ${shouldFail ? "FAIL" : "OK"}`,
      ].join("\n")
    );
  } else if (args.format === "text") {
    console.log(`Codebase monitor finished at ${nowIso()}`);
    console.log(
      `Scanned files: ${report.summary.scannedFiles} (of ${report.summary.totalFilesEnumerated})`
    );
    console.log(
      `Findings: high=${findingsBySeverity.high} medium=${findingsBySeverity.medium} low=${findingsBySeverity.low}`
    );
    if (acc.warningCount) console.log(`Warnings: ${acc.warningCount}`);
    for (const f of acc.findings.slice(0, 50)) {
      console.log(
        `- [${f.severity}] ${f.ruleId} ${f.file}:${f.line}:${f.column} ${f.message} :: ${f.excerpt}`
      );
    }
    if (acc.findings.length > 50) console.log(`(truncated to first 50 displayed; ${acc.findings.length} stored)`);
    if (acc.findingsTruncated) console.log("(note: findings list truncated for memory safety)");
    if (acc.warningsTruncated) console.log("(note: warnings list truncated for memory safety)");
  } else {
    const json = JSON.stringify(report, null, 2);
    console.log(json);
  }

  if (args.out) {
    const outAbs = path.resolve(repoRoot, args.out);
    await fs.promises.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.promises.writeFile(outAbs, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  process.exit(shouldFail ? 2 : 0);
}

main().catch((err) => {
  console.error("codebase-monitor failed:", err);
  process.exit(3);
});

