import { logger } from './logger';

/**
 * Safe JSON parsing with error handling
 * @param jsonString - The JSON string to parse
 * @param defaultValue - Default value to return if parsing fails
 * @param logError - Whether to log parsing errors (default: true)
 * @returns Parsed object or default value
 */
export function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
  defaultValue: T | null = null,
  logError: boolean = true
): T | null {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    if (logError) {
      logger.warn('JSON parse error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        jsonString: jsonString.substring(0, 100), // Log first 100 chars only
      });
    }
    return defaultValue;
  }
}

/**
 * Safe JSON stringification with error handling
 * @param value - The value to stringify
 * @param defaultValue - Default value to return if stringification fails
 * @param logError - Whether to log stringification errors (default: true)
 * @returns JSON string or default value
 */
export function safeJsonStringify(
  value: any,
  defaultValue: string = '{}',
  logError: boolean = true
): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (logError) {
      logger.warn('JSON stringify error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return defaultValue;
  }
}
