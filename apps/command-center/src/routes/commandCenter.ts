import { Router } from 'express';
import { z } from 'zod';
import { RepoStore } from '../store/repoStore';
import { OrchestratorClient } from '../services/orchestratorClient';

export function commandCenterRoutes(store: RepoStore) {
  const router = Router();

  router.get('/repos', async (_req, res) => {
    const repos = await store.listRepos();
    res.json({ repos });
  });

  router.post('/repos', async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(200),
        orchestratorBaseUrl: z.string().url(),
        apiKey: z.string().min(1).optional(),
      })
      .parse(req.body);

    const repo = await store.createRepo(body);
    res.status(201).json({ repo });
  });

  router.delete('/repos/:repoId', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const ok = await store.deleteRepo(repoId);
    res.status(ok ? 204 : 404).end();
  });

  router.get('/repos/:repoId/health', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const client = new OrchestratorClient(repo);
    const health = await client.health();
    res.json({ repoId: repo.id, health });
  });

  router.get('/repos/:repoId/agents', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;

    const client = new OrchestratorClient(repo);
    const agents = await client.listAgents({ limit, offset });
    res.json({ repoId: repo.id, agents });
  });

  router.post('/repos/:repoId/agents', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const body = z
      .object({
        name: z.string().min(1).max(200),
        agent_type: z.enum(['general', 'researcher', 'analyst']).optional(),
        model: z.string().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        max_iterations: z.number().int().min(1).max(50).optional(),
      })
      .parse(req.body);

    const client = new OrchestratorClient(repo);
    const created = await client.createAgent(body);
    res.status(201).json({ repoId: repo.id, ...created });
  });

  router.get('/repos/:repoId/runs', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const client = new OrchestratorClient(repo);
    const runs = await client.listRuns({ limit, offset, status });
    res.json({ repoId: repo.id, runs });
  });

  router.post('/repos/:repoId/runs', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const body = z
      .object({
        agent_id: z.string().min(1),
        task: z.string().min(1),
        scheduled_for: z.number().int().optional(),
        interval_seconds: z.number().int().min(1).optional(),
        max_attempts: z.number().int().min(1).max(50).optional(),
      })
      .parse(req.body);

    const client = new OrchestratorClient(repo);
    const created = await client.enqueueRun(body);
    res.status(201).json({ repoId: repo.id, ...created });
  });

  router.get('/repos/:repoId/runs/:runId', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const runId = z.string().min(1).parse(req.params.runId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const client = new OrchestratorClient(repo);
    const run = await client.getRun(runId);
    res.json({ repoId: repo.id, run });
  });

  router.get('/repos/:repoId/runs/:runId/events', async (req, res) => {
    const repoId = z.string().min(1).parse(req.params.repoId);
    const runId = z.string().min(1).parse(req.params.runId);
    const repo = await store.getRepo(repoId);
    if (!repo) return res.status(404).json({ error: 'repo_not_found' });

    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const client = new OrchestratorClient(repo);
    const events = await client.listEvents(runId, { limit });
    res.json({ repoId: repo.id, ...((events as object) ?? {}) });
  });

  // Aggregation across all registered repos
  router.get('/agents', async (req, res) => {
    const limitPerRepo = req.query.limitPerRepo ? Number(req.query.limitPerRepo) : 100;
    const repos = await store.listRepos();

    const results = await Promise.all(
      repos.map(async (repo) => {
        try {
          const client = new OrchestratorClient(repo);
          const agents = await client.listAgents({ limit: limitPerRepo, offset: 0 });
          return { ok: true as const, repo, agents };
        } catch (error) {
          return {
            ok: false as const,
            repo,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    res.json({
      repos: results.map((r) => ({
        repoId: r.repo.id,
        repoName: r.repo.name,
        orchestratorBaseUrl: r.repo.orchestratorBaseUrl,
        agents: r.ok ? r.agents : [],
        error: r.ok ? null : r.error,
      })),
    });
  });

  router.get('/runs', async (req, res) => {
    const limitPerRepo = req.query.limitPerRepo ? Number(req.query.limitPerRepo) : 50;
    const status = req.query.status ? String(req.query.status) : undefined;
    const repos = await store.listRepos();

    const results = await Promise.all(
      repos.map(async (repo) => {
        try {
          const client = new OrchestratorClient(repo);
          const runs = await client.listRuns({ limit: limitPerRepo, offset: 0, status });
          return { ok: true as const, repo, runs };
        } catch (error) {
          return {
            ok: false as const,
            repo,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const flattened = results.flatMap((r) => {
      if (!r.ok) return [];
      return r.runs.map((run) => ({
        repoId: r.repo.id,
        repoName: r.repo.name,
        orchestratorBaseUrl: r.repo.orchestratorBaseUrl,
        run,
      }));
    });

    res.json({
      runs: flattened,
      errors: results
        .filter((r) => !r.ok)
        .map((r) => ({
          repoId: r.repo.id,
          repoName: r.repo.name,
          error: r.error,
        })),
    });
  });

  return router;
}

