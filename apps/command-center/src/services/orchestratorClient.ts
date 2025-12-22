import axios, { AxiosInstance } from 'axios';
import type { Repo } from '../store/repoStore';

export type OrchestratorAgent = {
  id: string;
  name: string;
  agent_type: string;
  config: Record<string, unknown>;
  created_at: string;
};

export type OrchestratorRun = {
  run_id: string;
  agent_id: string;
  task: string;
  status: string;
  created_at: string;
  updated_at: string;
  scheduled_for: number;
  interval_seconds?: number | null;
  attempts: number;
  max_attempts: number;
  last_error?: string | null;
  lease_owner?: string | null;
  lease_expires_at?: number | null;
};

export class OrchestratorClient {
  private readonly client: AxiosInstance;

  constructor(repo: Repo) {
    this.client = axios.create({
      baseURL: repo.orchestratorBaseUrl,
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        ...(repo.apiKey ? { Authorization: `ApiKey ${repo.apiKey}` } : {}),
      },
    });
  }

  async health(): Promise<unknown> {
    const res = await this.client.get('/health');
    return res.data;
  }

  async listAgents(params?: { limit?: number; offset?: number }): Promise<OrchestratorAgent[]> {
    const res = await this.client.get('/api/v1/orchestrator/agents', { params });
    return res.data.agents ?? [];
  }

  async createAgent(body: {
    name: string;
    agent_type?: 'general' | 'researcher' | 'analyst';
    model?: string;
    temperature?: number;
    max_iterations?: number;
  }): Promise<{ agent_id: string }> {
    const res = await this.client.post('/api/v1/orchestrator/agents', body);
    return res.data;
  }

  async listRuns(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<OrchestratorRun[]> {
    const res = await this.client.get('/api/v1/orchestrator/runs', { params });
    return res.data.runs ?? [];
  }

  async enqueueRun(body: {
    agent_id: string;
    task: string;
    scheduled_for?: number;
    interval_seconds?: number;
    max_attempts?: number;
  }): Promise<{ run_id: string }> {
    const res = await this.client.post('/api/v1/orchestrator/runs', body);
    return res.data;
  }

  async getRun(runId: string): Promise<OrchestratorRun> {
    const res = await this.client.get(`/api/v1/orchestrator/runs/${runId}`);
    return res.data;
  }

  async listEvents(runId: string, params?: { limit?: number }): Promise<unknown> {
    const res = await this.client.get(`/api/v1/orchestrator/runs/${runId}/events`, { params });
    return res.data;
  }
}

