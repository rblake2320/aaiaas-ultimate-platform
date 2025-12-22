import { config } from 'dotenv';

// Load test environment variables (optional file).
config({ path: '.env.test' });

process.env.NODE_ENV = 'test';

// Provide safe defaults so unit tests don't fail during module import.
process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/aaiaas_test';
process.env.JWT_SECRET ??= 'test_jwt_secret_32_chars_minimum____';
process.env.REFRESH_TOKEN_SECRET ??= 'test_refresh_secret_32_chars_min____';

