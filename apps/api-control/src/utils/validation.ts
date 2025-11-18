/**
 * Validation utilities for request parameters
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate and parse a numeric string parameter
 * @param value - The value to parse
 * @param paramName - Name of the parameter (for error messages)
 * @param options - Validation options
 * @returns Parsed number
 * @throws ValidationError if invalid
 */
export function validateNumericParam(
  value: any,
  paramName: string,
  options: {
    min?: number;
    max?: number;
    defaultValue?: number;
    integer?: boolean;
  } = {}
): number {
  if (value === undefined || value === null || value === '') {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new ValidationError(`${paramName} is required`);
  }

  const num = options.integer ? parseInt(value as string, 10) : parseFloat(value as string);

  if (isNaN(num)) {
    throw new ValidationError(`${paramName} must be a valid number`);
  }

  if (options.min !== undefined && num < options.min) {
    throw new ValidationError(`${paramName} must be at least ${options.min}`);
  }

  if (options.max !== undefined && num > options.max) {
    throw new ValidationError(`${paramName} must be at most ${options.max}`);
  }

  return num;
}

/**
 * Validate and parse a date string parameter
 * @param value - The value to parse
 * @param paramName - Name of the parameter (for error messages)
 * @param options - Validation options
 * @returns Parsed Date object
 * @throws ValidationError if invalid
 */
export function validateDateParam(
  value: any,
  paramName: string,
  options: {
    defaultValue?: Date;
    minDate?: Date;
    maxDate?: Date;
  } = {}
): Date {
  if (value === undefined || value === null || value === '') {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new ValidationError(`${paramName} is required`);
  }

  const date = new Date(value as string);

  if (isNaN(date.getTime())) {
    throw new ValidationError(`${paramName} must be a valid date`);
  }

  if (options.minDate && date < options.minDate) {
    throw new ValidationError(
      `${paramName} must be on or after ${options.minDate.toISOString()}`
    );
  }

  if (options.maxDate && date > options.maxDate) {
    throw new ValidationError(
      `${paramName} must be on or before ${options.maxDate.toISOString()}`
    );
  }

  return date;
}

/**
 * Validate a string enum parameter
 * @param value - The value to validate
 * @param paramName - Name of the parameter
 * @param allowedValues - Array of allowed values
 * @param defaultValue - Optional default value
 * @returns The validated value
 * @throws ValidationError if invalid
 */
export function validateEnumParam<T extends string>(
  value: any,
  paramName: string,
  allowedValues: readonly T[],
  defaultValue?: T
): T {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new ValidationError(`${paramName} is required`);
  }

  if (!allowedValues.includes(value as T)) {
    throw new ValidationError(
      `${paramName} must be one of: ${allowedValues.join(', ')}`
    );
  }

  return value as T;
}
