import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { githubService } from '../services/githubService';

const listReposQuerySchema = z.object({
  visibility: z.enum(['all', 'public', 'private']).optional(),
  affiliation: z.string().optional(),
  sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});

export class GitHubController {
  async listRepos(req: AuthRequest, res: Response) {
    const githubToken = String(req.headers['x-github-token'] || '').trim();
    const query = listReposQuerySchema.parse(req.query);

    const repos = await githubService.listAllUserRepos(githubToken, query);

    res.json({
      total: repos.length,
      repos,
    });
  }
}

export const githubController = new GitHubController();
