import { HttpAgentRunWorker } from "../base";

export class ResearcherAgentWorker extends HttpAgentRunWorker {
  constructor() {
    super(
      {
        id: "researcher",
        displayName: "Research Agent Worker",
        description: "Research-focused agent execution via AI Services (/api/v1/agent/run).",
        tags: ["agent", "research"],
      },
      "researcher",
    );
  }
}

