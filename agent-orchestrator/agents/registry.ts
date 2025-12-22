import type { AgentTask, AgentWorker, AgentWorkerId } from "./types";
import { AgentWorkerError } from "./errors";

export class AgentRegistry {
  private readonly workers = new Map<AgentWorkerId, AgentWorker>();

  public register(worker: AgentWorker): this {
    if (!worker?.meta?.id?.trim()) {
      throw new AgentWorkerError("Worker meta.id is required", "CONFIG_ERROR");
    }
    if (this.workers.has(worker.meta.id)) {
      throw new AgentWorkerError(`Worker already registered: ${worker.meta.id}`, "CONFIG_ERROR");
    }
    this.workers.set(worker.meta.id, worker);
    return this;
  }

  public get(id: AgentWorkerId): AgentWorker | undefined {
    return this.workers.get(id);
  }

  public list(): AgentWorker[] {
    return [...this.workers.values()];
  }

  /**
   * Pick the best worker for a task.
   * - If task.workerIdHint is provided, return that exact worker (or throw).
   * - Otherwise, return the first worker whose supports() returns true.
   */
  public pick(task: AgentTask): AgentWorker {
    if (task.workerIdHint) {
      const w = this.workers.get(task.workerIdHint);
      if (!w) throw new AgentWorkerError(`Unknown worker: ${task.workerIdHint}`, "CONFIG_ERROR");
      return w;
    }

    for (const w of this.workers.values()) {
      if (w.supports(task)) return w;
    }

    throw new AgentWorkerError("No worker supports this task", "CONFIG_ERROR");
  }
}

