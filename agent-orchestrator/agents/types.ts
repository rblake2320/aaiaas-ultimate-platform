export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type AgentWorkerId = string;

export interface AgentTask {
  /** High-level user goal / instruction. */
  prompt: string;
  /** Optional hint for selecting a specific worker. */
  workerIdHint?: AgentWorkerId;
  /** Optional hint for the agent type used by the AI service (general|researcher|analyst). */
  agentTypeHint?: "general" | "researcher" | "analyst" | (string & {});
  /** Optional per-task iteration limit. */
  maxIterations?: number;
  /** Arbitrary metadata (tenant, correlation ids, etc). */
  metadata?: JsonObject;
}

export interface AgentContext {
  /** Base URL for the AI Services API (FastAPI). */
  aiApiBaseUrl: string;
  /** API key for calling AI Services (sent as Authorization: ApiKey <key>). */
  aiApiKey: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Correlation id for tracing across services. */
  correlationId?: string;
}

export interface AgentWorkerMeta {
  id: AgentWorkerId;
  displayName: string;
  description: string;
  tags?: string[];
}

export interface AgentWorkerRunResult {
  /** Final natural-language output. */
  output: string;
  /** Raw provider response for debugging/observability. */
  raw?: JsonValue;
  /** Timing / tracing info. */
  trace?: JsonObject;
}

export interface AgentWorker {
  meta: AgentWorkerMeta;

  /**
   * Whether this worker can handle the given task.
   * Used by the orchestrator/registry to pick the right worker.
   */
  supports(task: AgentTask): boolean;

  /**
   * Execute the task and return a structured result.
   */
  run(task: AgentTask, ctx: AgentContext): Promise<AgentWorkerRunResult>;
}

