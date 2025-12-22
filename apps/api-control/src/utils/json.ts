export function normalizeJsonb<T = unknown>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      // If it isn't valid JSON, treat as null rather than crashing handlers.
      return null;
    }
  }
  return value as T;
}

