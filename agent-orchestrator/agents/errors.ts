export class AgentWorkerError extends Error {
  public readonly name = "AgentWorkerError";

  constructor(
    message: string,
    public readonly code:
      | "INVALID_CONTEXT"
      | "INVALID_TASK"
      | "UPSTREAM_ERROR"
      | "TIMEOUT"
      | "CONFIG_ERROR" = "UPSTREAM_ERROR",
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}

