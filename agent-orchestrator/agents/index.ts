export * from "./types";
export * from "./errors";
export * from "./base";
export * from "./registry";

export * from "./workers/generalWorker";
export * from "./workers/researcherWorker";
export * from "./workers/analystWorker";

import { AgentRegistry } from "./registry";
import { GeneralAgentWorker } from "./workers/generalWorker";
import { ResearcherAgentWorker } from "./workers/researcherWorker";
import { AnalystAgentWorker } from "./workers/analystWorker";

/**
 * Convenience helper to build the default worker registry.
 */
export function createDefaultAgentRegistry(): AgentRegistry {
  return new AgentRegistry()
    .register(new GeneralAgentWorker())
    .register(new ResearcherAgentWorker())
    .register(new AnalystAgentWorker());
}

