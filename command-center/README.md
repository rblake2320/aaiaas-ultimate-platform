# Command Center

`/command-center` is the brain that manages your AI agent army across all GitHub repos.

## Scanner (multi-repo)

The scanner discovers repositories (via config and/or GitHub CLI), syncs them to a local cache, and produces a JSON report with basic repo fingerprints and signals.

### Quick start

1) Create a config file:

```json
{
  "orgs": ["my-org"],
  "repos": ["octocat/Hello-World"],
  "limit": 200,
  "cacheDir": ".command-center/repos",
  "outFile": "command-center/scanner/out/report.json",
  "concurrency": 4
}
```

2) Run:

```bash
npm -w command-center run build
npm -w command-center run dev -- scan --config command-center/scanner/config.example.json
```

Or after building:

```bash
npm -w command-center run build
./command-center/node_modules/.bin/command-center scan --config command-center/scanner/config.example.json
```

