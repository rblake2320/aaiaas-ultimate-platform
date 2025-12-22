import { connectRedis, disconnectRedis } from './config/redis';
import { db } from './config/database';
import { logger } from './utils/logger';
import type { AlwaysRunningAgent } from './agents/agent';
import { WorkflowRunAgent } from './agents/workflowRunAgent';
import { WebhookDeliveryAgent } from './agents/webhookDeliveryAgent';
import { HeartbeatAgent } from './agents/heartbeatAgent';

async function startAgents() {
  await connectRedis();
  logger.info('Agents connected to Redis');

  const agents: AlwaysRunningAgent[] = [new HeartbeatAgent(), new WorkflowRunAgent(), new WebhookDeliveryAgent()];

  const timers = agents.map((agent) => {
    logger.info('Starting agent', { name: agent.name, intervalMs: agent.intervalMs });
    // Kick once immediately
    agent.tick().catch(() => undefined);
    return setInterval(() => {
      agent.tick().catch(() => undefined);
    }, agent.intervalMs);
  });

  const shutdown = async (signal: string) => {
    logger.info('Shutting down agents', { signal });
    timers.forEach((t) => clearInterval(t));
    await disconnectRedis().catch(() => undefined);
    await db.destroy().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startAgents().catch((error) => {
  logger.error('Failed to start agents', { error: error?.message || String(error) });
  process.exit(1);
});

