import { WorkflowEngine, WorkflowDefinition, WorkflowContext } from '../src/services/workflowService';
import { db } from '../src/config/database';

// Mock dependencies
jest.mock('../src/config/database');
jest.mock('../src/utils/logger');
jest.mock('axios');

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let mockContext: WorkflowContext;

  beforeEach(() => {
    engine = new WorkflowEngine();
    mockContext = {
      variables: {},
      executionId: 'test-execution-123',
      organizationId: 'org-456',
      userId: 'user-789',
    };

    // Setup database mocks
    (db as jest.MockedFunction<any>).mockReturnValue({
      insert: jest.fn().mockResolvedValue({}),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockResolvedValue({}),
    });
  });

  describe('interpolateString', () => {
    it('should interpolate variables in template strings', () => {
      const template = 'Hello {{name}}, you are {{age}} years old';
      const variables = { name: 'Alice', age: 30 };

      // Access private method via any
      const result = (engine as any).interpolateString(template, variables);

      expect(result).toBe('Hello Alice, you are 30 years old');
    });

    it('should leave unmatched variables unchanged', () => {
      const template = 'Hello {{name}}, {{missing}}';
      const variables = { name: 'Bob' };

      const result = (engine as any).interpolateString(template, variables);

      expect(result).toBe('Hello Bob, {{missing}}');
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate simple comparison conditions', () => {
      const condition = 'value > 10';
      const variables = { value: 15 };

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(true);
    });

    it('should evaluate equality conditions', () => {
      const condition = 'status == "active"';
      const variables = { status: 'active' };

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(true);
    });

    it('should evaluate boolean conditions', () => {
      const condition = 'isEnabled';
      const variables = { isEnabled: true };

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(true);
    });

    it('should handle complex expressions', () => {
      const condition = '(count > 5) && (status == "ready")';
      const variables = { count: 10, status: 'ready' };

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(true);
    });

    it('should return false for invalid conditions', () => {
      const condition = 'invalid syntax here';
      const variables = {};

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(false);
    });

    it('should NOT allow code execution (security test)', () => {
      // This should NOT execute arbitrary code
      const condition = 'process.exit(1)';
      const variables = {};

      const result = (engine as any).evaluateCondition(condition, variables);

      // Should fail safely and return false
      expect(result).toBe(false);
      // Process should still be running
      expect(process).toBeDefined();
    });

    it('should NOT allow access to global objects', () => {
      const condition = 'require("fs").readFileSync("/etc/passwd")';
      const variables = {};

      const result = (engine as any).evaluateCondition(condition, variables);

      // Should fail safely
      expect(result).toBe(false);
    });
  });

  describe('interpolateVariables', () => {
    it('should interpolate nested objects', () => {
      const obj = {
        message: 'Hello {{name}}',
        user: {
          greeting: 'Welcome {{name}}',
        },
      };
      const variables = { name: 'Alice' };

      const result = (engine as any).interpolateVariables(obj, variables);

      expect(result.message).toBe('Hello Alice');
      expect(result.user.greeting).toBe('Welcome Alice');
    });

    it('should interpolate arrays', () => {
      const arr = ['Hello {{name}}', 'Goodbye {{name}}'];
      const variables = { name: 'Bob' };

      const result = (engine as any).interpolateVariables(arr, variables);

      expect(result).toEqual(['Hello Bob', 'Goodbye Bob']);
    });

    it('should handle non-string values', () => {
      const obj = {
        count: 42,
        enabled: true,
        data: null,
      };
      const variables = {};

      const result = (engine as any).interpolateVariables(obj, variables);

      expect(result).toEqual(obj);
    });
  });

  describe('executeDelay', () => {
    it('should delay for specified duration', async () => {
      const config = { duration: 100 };
      const startTime = Date.now();

      const result = await (engine as any).executeDelay(config);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some timing variance
      expect(result).toEqual({ delayed: 100 });
    });

    it('should use default duration if not specified', async () => {
      const config = {};

      const result = await (engine as any).executeDelay(config);

      expect(result).toEqual({ delayed: 1000 });
    });
  });

  describe('Security Tests', () => {
    it('should not allow eval in conditions', () => {
      const condition = 'eval("malicious code")';
      const variables = {};

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(false);
    });

    it('should not allow Function constructor in conditions', () => {
      const condition = 'Function("return process")()';
      const variables = {};

      const result = (engine as any).evaluateCondition(condition, variables);

      expect(result).toBe(false);
    });

    it('should sanitize variable interpolation', () => {
      const template = '{{userInput}}';
      const variables = { userInput: '<script>alert("xss")</script>' };

      const result = (engine as any).interpolateString(template, variables);

      // Should interpolate but not execute
      expect(result).toBe('<script>alert("xss")</script>');
    });
  });
});
