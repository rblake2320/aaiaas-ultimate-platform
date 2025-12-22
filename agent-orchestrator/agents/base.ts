import { AgentWorker, AgentWorkerMeta, AgentTask, AgentContext, AgentWorkerRunResult } from "./types";
import { AgentWorkerError } from "./errors";

export abstract class BaseAgentWorker implements AgentWorker {
  public readonly meta: AgentWorkerMeta;

  protected constructor(meta: AgentWorkerMeta) {
    this.meta = meta;
  }

  public supports(task: AgentTask): boolean {
    if (task.workerIdHint) return task.workerIdHint === this.meta.id;
    return true;
  }

  public abstract run(task: AgentTask, ctx: AgentContext): Promise<AgentWorkerRunResult>;
}

export abstract class HttpAgentRunWorker extends BaseAgentWorker {
  protected readonly defaultAgentType: "general" | "researcher" | "analyst";
  protected readonly maxRetries: number = 2;

  protected constructor(
    meta: AgentWorkerMeta,
    defaultAgentType: "general" | "researcher" | "analyst",
  ) {
    super(meta);
    this.defaultAgentType = defaultAgentType;
  }

  public override supports(task: AgentTask): boolean {
    if (!super.supports(task)) return false;
    if (task.agentTypeHint && ["general", "researcher", "analyst"].includes(task.agentTypeHint)) {
      return task.agentTypeHint === this.defaultAgentType;
    }
    return true;
  }

  public async run(task: AgentTask, ctx: AgentContext): Promise<AgentWorkerRunResult> {
    if (!task?.prompt?.trim()) {
      throw new AgentWorkerError("Task prompt is required", "INVALID_TASK");
    }
    if (!ctx?.aiApiBaseUrl?.trim() || !ctx?.aiApiKey?.trim()) {
      throw new AgentWorkerError("AI API context is missing (baseUrl/apiKey)", "INVALID_CONTEXT");
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutMs = ctx.timeoutMs ?? 60_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = new URL("/api/v1/agent/run", ctx.aiApiBaseUrl);
      const body = {
        task: task.prompt,
        agent_type: (task.agentTypeHint ?? this.defaultAgentType) as string,
        max_iterations: task.maxIterations ?? 10,
      };

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });

      const shouldRetry = (status: number) => [408, 425, 429, 500, 502, 503, 504].includes(status);

      let lastUpstream: { status: number; body: unknown } | undefined;
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `ApiKey ${ctx.aiApiKey}`,
            ...(ctx.correlationId ? { "x-correlation-id": ctx.correlationId } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const text = await res.text();
        let json: any = undefined;
        try {
          json = text ? JSON.parse(text) : undefined;
        } catch {
          // leave as text
        }

        if (res.ok) {
          const output = (json && typeof json.answer === "string" ? json.answer : text) ?? "";
          return {
            output,
            raw: json ?? (text as any),
            trace: {
              workerId: this.meta.id,
              startedAtMs: startedAt,
              elapsedMs: Date.now() - startedAt,
              agentType: body.agent_type,
              attempts: attempt + 1,
              iterations: (json && typeof json.iterations === "number" ? json.iterations : null) as any,
            },
          };
        }

        lastUpstream = { status: res.status, body: json ?? text };
        if (attempt >= this.maxRetries || !shouldRetry(res.status)) break;

        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
        const baseBackoffMs = 250 * Math.pow(2, attempt); // 250ms, 500ms, 1000ms...
        const jitterMs = Math.floor(Math.random() * 150);
        const delayMs = Number.isFinite(retryAfterMs) ? retryAfterMs : baseBackoffMs + jitterMs;
        await sleep(delayMs);
      }

      const detail =
        (lastUpstream?.body &&
          typeof lastUpstream.body === "object" &&
          (lastUpstream.body as any).detail) ||
        (lastUpstream?.body &&
          typeof lastUpstream.body === "object" &&
          ((lastUpstream.body as any).error || (lastUpstream.body as any).message)) ||
        (typeof lastUpstream?.body === "string" ? lastUpstream.body : undefined) ||
        (lastUpstream ? `HTTP ${lastUpstream.status}` : "Unknown upstream error");

      throw new AgentWorkerError(`Upstream agent run failed: ${detail}`, "UPSTREAM_ERROR", lastUpstream);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new AgentWorkerError(`Timed out after ${timeoutMs}ms`, "TIMEOUT", err);
      }
      if (err instanceof AgentWorkerError) throw err;
      throw new AgentWorkerError("Worker run failed", "UPSTREAM_ERROR", err);
    } finally {
      clearTimeout(timeout);
    }
  }
}

