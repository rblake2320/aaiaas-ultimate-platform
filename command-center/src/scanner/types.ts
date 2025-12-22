export type SyncStrategy = "ff-only" | "reclone";

export type ScannerConfigFile = {
  /**
   * GitHub orgs to scan. Uses `gh repo list <org>` to enumerate repos.
   */
  orgs?: string[];

  /**
   * Explicit repos to scan, in `owner/name` form.
   */
  repos?: string[];

  /**
   * Max repos per org to fetch from GitHub.
   */
  limit?: number;

  /**
   * Local cache directory for cloned repos (relative to process cwd).
   */
  cacheDir?: string;

  /**
   * JSON output path for report (relative to process cwd).
   */
  outFile?: string;

  /**
   * Number of repos to sync/scan concurrently.
   */
  concurrency?: number;

  /**
   * Repo sync settings.
   */
  sync?: {
    strategy?: SyncStrategy;
    /**
     * Shallow clone depth. Used on initial clone.
     */
    depth?: number;
  };
};

export type ScannerConfig = Required<
  Pick<ScannerConfigFile, "orgs" | "repos" | "limit" | "cacheDir" | "outFile" | "concurrency">
> & {
  sync: Required<NonNullable<ScannerConfigFile["sync"]>>;
};

export type RepoDescriptor = {
  nameWithOwner: string; // owner/name
  defaultBranch?: string;
  isPrivate?: boolean;
  htmlUrl?: string;
};

export type RepoSyncResult = {
  nameWithOwner: string;
  localPath: string;
  ok: boolean;
  mode: "cloned" | "updated" | "skipped" | "failed";
  error?: string;
  defaultBranch?: string;
  headSha?: string;
  headDate?: string;
};

export type RepoScanResult = {
  nameWithOwner: string;
  localPath: string;
  ok: boolean;
  error?: string;

  headSha?: string;
  headDate?: string;
  defaultBranch?: string;

  summary?: {
    fileCount: number;
    totalBytes: number;
  };

  languages?: Record<string, number>; // language -> bytes
  manifests?: {
    packageJson?: boolean;
    requirementsTxt?: boolean;
    pyprojectToml?: boolean;
    pipfile?: boolean;
    goMod?: boolean;
    cargoToml?: boolean;
    pomXml?: boolean;
    gradle?: boolean;
    dockerfile?: boolean;
    dockerCompose?: boolean;
  };
  workflows?: string[];
  envFiles?: string[];
};

export type ScanReport = {
  generatedAt: string;
  scannerVersion: string;
  config: ScannerConfig;
  targets: {
    orgs: string[];
    repos: string[];
    resolvedRepoCount: number;
  };
  results: {
    ok: number;
    failed: number;
  };
  repos: RepoScanResult[];
};

