export interface AlwaysRunningAgent {
  /** Stable identifier used in logs/heartbeats */
  name: string;
  /** How often to run a tick */
  intervalMs: number;
  /** One unit of work (should never throw) */
  tick: () => Promise<void>;
}

