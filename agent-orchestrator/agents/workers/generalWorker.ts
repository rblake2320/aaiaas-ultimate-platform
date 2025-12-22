import { HttpAgentRunWorker } from "../base";

export class GeneralAgentWorker extends HttpAgentRunWorker {
  constructor() {
    super(
      {
        id: "general",
        displayName: "General Agent Worker",
        description: "General-purpose agent execution via AI Services (/api/v1/agent/run).",
        tags: ["agent", "general"],
      },
      "general",
    );
  }
}

