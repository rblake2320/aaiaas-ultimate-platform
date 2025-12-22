import { HttpAgentRunWorker } from "../base";

export class AnalystAgentWorker extends HttpAgentRunWorker {
  constructor() {
    super(
      {
        id: "analyst",
        displayName: "Analyst Agent Worker",
        description: "Analysis-focused agent execution via AI Services (/api/v1/agent/run).",
        tags: ["agent", "analysis"],
      },
      "analyst",
    );
  }
}

