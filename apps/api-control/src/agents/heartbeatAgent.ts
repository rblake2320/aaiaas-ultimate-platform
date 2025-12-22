import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';
import type { AlwaysRunningAgent } from './agent';

export class HeartbeatAgent implements AlwaysRunningAgent {
  name = 'heartbeat';
  intervalMs = 5000;

  tick = async () => {
    try {
      const key = 'aaiaas:agents:control:heartbeat';
      const now = new Date().toISOString();
      await redisClient.set(key, now, { EX: 30 });
    } catch (error: any) {
      logger.error('HeartbeatAgent tick error', { error: error?.message || String(error) });
    }
  };
}

