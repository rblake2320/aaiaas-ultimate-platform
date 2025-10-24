// Jest setup file
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Add custom matchers if needed
expect.extend({
  toBeValidJWT(received: string) {
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    const pass = jwtRegex.test(received);
    
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid JWT`
          : `expected ${received} to be a valid JWT`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidJWT(): R;
    }
  }
}

