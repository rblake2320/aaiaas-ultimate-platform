import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { githubService } from '../../../src/services/githubService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitHubService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('paginates until all repos are fetched', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            name: 'repo-one',
            full_name: 'me/repo-one',
            private: false,
            html_url: 'https://github.com/me/repo-one',
            default_branch: 'main',
            archived: false,
            fork: false,
            updated_at: '2025-01-01T00:00:00Z',
            owner: { login: 'me' },
          },
        ],
        headers: {
          link:
            '<https://api.github.com/user/repos?page=2&per_page=100>; rel="next", <https://api.github.com/user/repos?page=2&per_page=100>; rel="last"',
        },
      } as any)
      .mockResolvedValueOnce({
        data: [
          {
            id: 2,
            name: 'repo-two',
            full_name: 'me/repo-two',
            private: true,
            html_url: 'https://github.com/me/repo-two',
            default_branch: 'main',
            archived: false,
            fork: false,
            updated_at: '2025-01-02T00:00:00Z',
            owner: { login: 'me' },
          },
        ],
        headers: {},
      } as any);

    const repos = await githubService.listAllUserRepos('ghp_1234567890');

    expect(repos).toHaveLength(2);
    expect(repos[0].fullName).toBe('me/repo-one');
    expect(repos[1].private).toBe(true);

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get.mock.calls[0][1]?.params?.page).toBe(1);
    expect(mockedAxios.get.mock.calls[0][1]?.params?.per_page).toBe(100);
    expect(mockedAxios.get.mock.calls[1][1]?.params?.page).toBe(2);
  });

  it('returns 401-style AppError when GitHub rejects the token', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Bad credentials' } },
      message: 'Request failed with status code 401',
    });

    await expect(
      githubService.listAllUserRepos('ghp_1234567890')
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

