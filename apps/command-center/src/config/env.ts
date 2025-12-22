import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4100'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COMMAND_CENTER_STORE_PATH: z.string().default('./command-center-store.json'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

