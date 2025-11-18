/**
 * Application constants
 */

// Time constants (in milliseconds)
export const TIME_CONSTANTS = {
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
} as const;

// Token expiration durations
export const TOKEN_EXPIRY = {
  REFRESH_TOKEN_MS: TIME_CONSTANTS.ONE_WEEK, // 7 days
  ACCESS_TOKEN_MS: TIME_CONSTANTS.FIFTEEN_MINUTES, // 15 minutes
} as const;

// API Key constants
export const API_KEY_CONSTANTS = {
  DEFAULT_RATE_LIMIT: 1000,
  PREFIX_LENGTH: 12,
  KEY_PREFIX: 'sk_',
} as const;

// Workflow constants
export const WORKFLOW_CONSTANTS = {
  DEFAULT_AI_API_URL: 'http://localhost:5000',
  DEFAULT_MODEL: 'gpt-4.1-mini',
  DEFAULT_TEMPERATURE: 0.7,
  DEFAULT_MAX_TOKENS: 500,
  DEFAULT_DELAY_MS: 1000,
} as const;

// Validation constants
export const VALIDATION_CONSTANTS = {
  MAX_DAYS_QUERY: 365,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
} as const;

// Default values
export const DEFAULTS = {
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: 'http://localhost:3000',
  AI_API_URL: 'http://localhost:5000',
  CONTROL_API_URL: 'http://localhost:4000',
} as const;
