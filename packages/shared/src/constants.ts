/**
 * Shared constants
 */

export const API_ROUTES = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
  },
  API_KEYS: {
    LIST: '/api/api-keys',
    CREATE: '/api/api-keys',
    DELETE: (id: string) => `/api/api-keys/${id}`,
  },
  WORKFLOWS: {
    LIST: '/api/workflows',
    CREATE: '/api/workflows',
    GET: (id: string) => `/api/workflows/${id}`,
    UPDATE: (id: string) => `/api/workflows/${id}`,
    DELETE: (id: string) => `/api/workflows/${id}`,
    EXECUTE: (id: string) => `/api/workflows/${id}/execute`,
  },
  USAGE: {
    SUMMARY: '/api/usage/summary',
    DETAILS: '/api/usage/details',
  },
} as const;

export const PLANS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export const STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
} as const;

export const LIMITS = {
  FREE: {
    API_CALLS_PER_MONTH: 1000,
    WORKFLOWS_MAX: 5,
    TEAM_MEMBERS_MAX: 2,
  },
  PRO: {
    API_CALLS_PER_MONTH: 100000,
    WORKFLOWS_MAX: 50,
    TEAM_MEMBERS_MAX: 10,
  },
  ENTERPRISE: {
    API_CALLS_PER_MONTH: -1, // unlimited
    WORKFLOWS_MAX: -1,
    TEAM_MEMBERS_MAX: -1,
  },
} as const;
