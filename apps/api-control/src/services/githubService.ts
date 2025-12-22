import axios from 'axios';
import { AppError } from '../middleware/errorHandler';

export type GitHubRepoVisibility = 'all' | 'public' | 'private';
export type GitHubRepoAffiliation =
  | 'owner'
  | 'collaborator'
  | 'organization_member'
  | `${'owner' | 'collaborator' | 'organization_member'},${string}`;
export type GitHubRepoSort = 'created' | 'updated' | 'pushed' | 'full_name';
export type GitHubRepoDirection = 'asc' | 'desc';

export interface ListUserReposOptions {
  visibility?: GitHubRepoVisibility;
  affiliation?: GitHubRepoAffiliation;
  sort?: GitHubRepoSort;
  direction?: GitHubRepoDirection;
}

export interface GitHubRepoSummary {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  archived: boolean;
  fork: boolean;
  updatedAt: string;
  ownerLogin: string;
}

function parseLinkHeader(linkHeader?: string): Record<string, string> {
  if (!linkHeader) return {};
  // Example:
  // <https://api.github.com/user/repos?page=2&per_page=100>; rel="next",
  // <https://api.github.com/user/repos?page=3&per_page=100>; rel="last"
  const links: Record<string, string> = {};
  for (const part of linkHeader.split(',')) {
    const section = part.trim();
    const match = section.match(/^<([^>]+)>\s*;\s*rel="([^"]+)"$/);
    if (match) {
      const [, url, rel] = match;
      links[rel] = url;
    }
  }
  return links;
}

function toAppError(err: unknown): AppError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const message =
      (err.response?.data as any)?.message ||
      err.message ||
      'GitHub API request failed';

    if (status === 401 || status === 403) {
      return new AppError(401, `GitHub authentication failed: ${message}`);
    }
    if (status === 429) {
      return new AppError(429, `GitHub rate limit hit: ${message}`);
    }
    if (status && status >= 400 && status < 500) {
      return new AppError(400, `GitHub API error: ${message}`);
    }
    return new AppError(502, `GitHub API unavailable: ${message}`);
  }

  return new AppError(500, 'Unexpected error while calling GitHub');
}

export class GitHubService {
  async listAllUserRepos(
    githubToken: string,
    options: ListUserReposOptions = {}
  ): Promise<GitHubRepoSummary[]> {
    if (!githubToken || githubToken.trim().length < 8) {
      throw new AppError(400, 'Missing or invalid GitHub token');
    }

    const perPage = 100;
    let page = 1;
    let nextUrl: string | undefined;
    const results: GitHubRepoSummary[] = [];

    while (true) {
      try {
        const response = await axios.get('https://api.github.com/user/repos', {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'aaiaas-api-control',
          },
          params: {
            per_page: perPage,
            page,
            ...options,
          },
        });

        const repos = Array.isArray(response.data) ? response.data : [];
        for (const r of repos) {
          results.push({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            private: Boolean(r.private),
            htmlUrl: r.html_url,
            defaultBranch: r.default_branch,
            archived: Boolean(r.archived),
            fork: Boolean(r.fork),
            updatedAt: r.updated_at,
            ownerLogin: r.owner?.login ?? 'unknown',
          });
        }

        const links = parseLinkHeader(response.headers?.link);
        nextUrl = links.next;
        if (!nextUrl) break;

        // If GitHub returns Link: next, keep going. Prefer incrementing page to
        // avoid relying on the next URL’s query parsing.
        page += 1;
      } catch (e) {
        // Normalize all axios errors into consistent API errors
        throw toAppError(e);
      }
    }

    return results;
  }
}

export const githubService = new GitHubService();
