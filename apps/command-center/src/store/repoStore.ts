import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const RepoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  orchestratorBaseUrl: z.string().url(),
  apiKey: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Repo = z.infer<typeof RepoSchema>;

const StoreFileSchema = z.object({
  version: z.literal(1),
  repos: z.array(RepoSchema),
});

type StoreFile = z.infer<typeof StoreFileSchema>;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

export class RepoStore {
  private readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async listRepos(): Promise<Repo[]> {
    const store = await this.readStore();
    return store.repos;
  }

  async getRepo(id: string): Promise<Repo | null> {
    const store = await this.readStore();
    return store.repos.find((r) => r.id === id) ?? null;
  }

  async createRepo(input: {
    name: string;
    orchestratorBaseUrl: string;
    apiKey?: string;
  }): Promise<Repo> {
    const now = new Date().toISOString();
    const repo: Repo = {
      id: uuidv4(),
      name: input.name,
      orchestratorBaseUrl: normalizeBaseUrl(input.orchestratorBaseUrl),
      apiKey: input.apiKey,
      createdAt: now,
      updatedAt: now,
    };

    const store = await this.readStore();
    store.repos.push(repo);
    await this.writeStore(store);
    return repo;
  }

  async deleteRepo(id: string): Promise<boolean> {
    const store = await this.readStore();
    const before = store.repos.length;
    store.repos = store.repos.filter((r) => r.id !== id);
    if (store.repos.length === before) return false;
    await this.writeStore(store);
    return true;
  }

  private async ensureDirExists() {
    const dir = path.dirname(path.resolve(this.storePath));
    await fs.mkdir(dir, { recursive: true });
  }

  private async readStore(): Promise<StoreFile> {
    await this.ensureDirExists();
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return StoreFileSchema.parse(parsed);
    } catch (err) {
      // If file doesn't exist or is invalid, start fresh.
      const empty: StoreFile = { version: 1, repos: [] };
      await this.writeStore(empty);
      return empty;
    }
  }

  private async writeStore(store: StoreFile): Promise<void> {
    await this.ensureDirExists();
    const tmpPath = `${this.storePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tmpPath, this.storePath);
  }
}

