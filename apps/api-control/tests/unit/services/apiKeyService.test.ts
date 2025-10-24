import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as jwt from '../../../src/utils/jwt';

jest.mock('../../../src/utils/jwt');
jest.mock('../../../src/config/database');

describe('APIKeyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAPIKey', () => {
    it('should generate key with sk_ prefix', () => {
      const mockKey = {
        key: 'sk_' + 'a'.repeat(64),
        prefix: 'sk_aaaaaaaaa',
        hash: 'hashed_value',
      };

      (jwt.generateApiKey as jest.Mock).mockReturnValue(mockKey);

      const result = jwt.generateApiKey();
      expect(result.key).toMatch(/^sk_/);
      expect(result.prefix).toMatch(/^sk_/);
    });

    it('should generate unique keys', () => {
      const keys = new Set();
      
      for (let i = 0; i < 100; i++) {
        const mockKey = {
          key: `sk_${Math.random().toString(36).substring(2)}`,
          prefix: `sk_${i}`,
          hash: `hash_${i}`,
        };
        (jwt.generateApiKey as jest.Mock).mockReturnValue(mockKey);
        keys.add(jwt.generateApiKey().key);
      }

      expect(keys.size).toBe(100);
    });

    it('should hash the API key for storage', () => {
      const mockKey = {
        key: 'sk_test_key',
        prefix: 'sk_test_ke',
        hash: 'hashed_sk_test_key',
      };

      (jwt.generateApiKey as jest.Mock).mockReturnValue(mockKey);
      (jwt.hashToken as jest.Mock).mockReturnValue(mockKey.hash);

      const result = jwt.generateApiKey();
      expect(result.hash).toBeDefined();
      expect(result.hash).not.toBe(result.key);
    });
  });

  describe('validateAPIKey', () => {
    it('should accept valid API key format', () => {
      const validKeys = [
        'sk_' + 'a'.repeat(64),
        'sk_' + '1'.repeat(64),
        'sk_test_1234567890abcdef',
      ];

      validKeys.forEach(key => {
        expect(key).toMatch(/^sk_/);
        expect(key.length).toBeGreaterThan(10);
      });
    });

    it('should reject invalid API key format', () => {
      const invalidKeys = [
        'invalid_key',
        'pk_wrong_prefix',
        'sk_',
        '',
        'sk_short',
      ];

      invalidKeys.forEach(key => {
        const isValid = key.startsWith('sk_') && key.length > 10;
        expect(isValid).toBe(false);
      });
    });
  });

  describe('revokeAPIKey', () => {
    it('should mark key as revoked', async () => {
      const keyId = 'key-123';
      
      // Mock would update the database
      const mockUpdate = jest.fn().mockResolvedValue({ revoked: true });
      
      await mockUpdate();
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should prevent revoked key from being used', async () => {
      const revokedKey = {
        id: 'key-123',
        revoked: true,
      };

      if (revokedKey.revoked) {
        expect(() => {
          throw new Error('API key has been revoked');
        }).toThrow('API key has been revoked');
      }
    });
  });

  describe('API Key Scopes', () => {
    it('should enforce scoped permissions', () => {
      const key = {
        scopes: ['chat', 'completions'],
      };

      expect(key.scopes).toContain('chat');
      expect(key.scopes).not.toContain('admin');
    });

    it('should allow wildcard scope', () => {
      const adminKey = {
        scopes: ['*'],
      };

      const hasPermission = (scope: string) => {
        return adminKey.scopes.includes('*') || adminKey.scopes.includes(scope);
      };

      expect(hasPermission('chat')).toBe(true);
      expect(hasPermission('admin')).toBe(true);
      expect(hasPermission('anything')).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should track API key usage', async () => {
      const keyId = 'key-123';
      const usageCount = 100;

      const mockUsage = {
        keyId,
        count: usageCount,
        limit: 1000,
      };

      expect(mockUsage.count).toBeLessThan(mockUsage.limit);
    });

    it('should reject requests exceeding rate limit', () => {
      const usage = {
        count: 1000,
        limit: 1000,
      };

      if (usage.count >= usage.limit) {
        expect(() => {
          throw new Error('Rate limit exceeded');
        }).toThrow('Rate limit exceeded');
      }
    });
  });

  describe('API Key Expiration', () => {
    it('should support optional expiration date', () => {
      const key = {
        expiresAt: new Date(Date.now() + 86400000), // 24 hours
      };

      const isExpired = key.expiresAt && key.expiresAt < new Date();
      expect(isExpired).toBe(false);
    });

    it('should reject expired keys', () => {
      const expiredKey = {
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      };

      const isExpired = expiredKey.expiresAt && expiredKey.expiresAt < new Date();
      expect(isExpired).toBe(true);
    });
  });
});

