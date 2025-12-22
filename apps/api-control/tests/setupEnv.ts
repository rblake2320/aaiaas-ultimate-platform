// Jest early setup (runs before test files are loaded)
import { config } from 'dotenv';

// Load test environment variables (optional)
config({ path: '.env.test' });

process.env.NODE_ENV = 'test';

// Minimal required env vars for module initialization
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/testdb';
process.env.JWT_SECRET ||= 'x'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ||= 'y'.repeat(32);

