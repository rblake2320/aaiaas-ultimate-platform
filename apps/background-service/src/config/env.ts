import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('7000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  LOG_LEVEL: z.string().default('info'),

  // Job controls
  WORKFLOW_RUN_TIMEOUT_MINUTES: z
    .string()
    .default('60')
    .transform((v) => Number(v)),
  TOKEN_RETENTION_DAYS: z
    .string()
    .default('30')
    .transform((v) => Number(v)),
  AUDIT_LOG_RETENTION_DAYS: z
    .string()
    .default('90')
    .transform((v) => Number(v)),
  WEBHOOK_DELIVERY_RETENTION_DAYS: z
    .string()
    .default('30')
    .transform((v) => Number(v)),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);
    const numericKeys = [
      'WORKFLOW_RUN_TIMEOUT_MINUTES',
      'TOKEN_RETENTION_DAYS',
      'AUDIT_LOG_RETENTION_DAYS',
      'WEBHOOK_DELIVERY_RETENTION_DAYS',
    ] as const;
    for (const key of numericKeys) {
      if (!Number.isFinite(parsed[key]) || parsed[key] < 0) {
        throw new Error(`Invalid ${key}: must be a non-negative number`);
      }
    }
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

export const env = validateEnv();

