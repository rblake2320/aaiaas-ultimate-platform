import { db } from '../config/database';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface CreateApiKeyInput {
  name: string;
  organizationId: string;
  userId: string;
  scopes?: string[];
  expiresAt?: Date;
  rateLimit?: number;
}

export class ApiKeyService {
  /**
   * Generate a secure API key
   */
  private generateApiKey(): string {
    const prefix = 'sk';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  /**
   * Hash an API key for storage
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Create a new API key
   */
  async createApiKey(input: CreateApiKeyInput): Promise<{ id: string; key: string }> {
    const id = uuidv4();
    const apiKey = this.generateApiKey();
    const hashedKey = this.hashApiKey(apiKey);

    await db('api_keys').insert({
      id,
      organization_id: input.organizationId,
      user_id: input.userId,
      name: input.name,
      key_hash: hashedKey,
      key_prefix: apiKey.substring(0, 10),
      scopes: JSON.stringify(input.scopes || ['*']),
      rate_limit: input.rateLimit || 1000,
      expires_at: input.expiresAt,
      last_used_at: null,
    });

    logger.info('API key created', {
      keyId: id,
      organizationId: input.organizationId,
      userId: input.userId,
    });

    // Return the plain key only once
    return { id, key: apiKey };
  }

  /**
   * Validate an API key
   */
  async validateApiKey(apiKey: string): Promise<any | null> {
    const hashedKey = this.hashApiKey(apiKey);

    const key = await db('api_keys')
      .where({ key_hash: hashedKey, revoked: false })
      .first();

    if (!key) {
      return null;
    }

    // Check expiration
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return null;
    }

    // Update last used timestamp
    await db('api_keys')
      .where({ id: key.id })
      .update({ last_used_at: new Date() });

    // Load organization
    const organization = await db('organizations')
      .where({ id: key.organization_id })
      .first();

    return {
      id: key.id,
      organizationId: key.organization_id,
      userId: key.user_id,
      scopes: JSON.parse(key.scopes),
      rateLimit: key.rate_limit,
      organization,
    };
  }

  /**
   * List API keys for an organization
   */
  async listApiKeys(organizationId: string): Promise<any[]> {
    const keys = await db('api_keys')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc');

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.key_prefix,
      scopes: JSON.parse(key.scopes),
      rateLimit: key.rate_limit,
      revoked: key.revoked,
      expiresAt: key.expires_at,
      lastUsedAt: key.last_used_at,
      createdAt: key.created_at,
    }));
  }

  /**
   * Get API key details
   */
  async getApiKey(id: string, organizationId: string): Promise<any | null> {
    const key = await db('api_keys')
      .where({ id, organization_id: organizationId })
      .first();

    if (!key) {
      return null;
    }

    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.key_prefix,
      scopes: JSON.parse(key.scopes),
      rateLimit: key.rate_limit,
      revoked: key.revoked,
      expiresAt: key.expires_at,
      lastUsedAt: key.last_used_at,
      createdAt: key.created_at,
    };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string, organizationId: string): Promise<void> {
    await db('api_keys')
      .where({ id, organization_id: organizationId })
      .update({ revoked: true, updated_at: new Date() });

    logger.info('API key revoked', { keyId: id, organizationId });
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(id: string, organizationId: string): Promise<void> {
    await db('api_keys')
      .where({ id, organization_id: organizationId })
      .delete();

    logger.info('API key deleted', { keyId: id, organizationId });
  }

  /**
   * Update API key
   */
  async updateApiKey(
    id: string,
    organizationId: string,
    updates: { name?: string; scopes?: string[]; rateLimit?: number }
  ): Promise<void> {
    const updateData: any = { updated_at: new Date() };

    if (updates.name) updateData.name = updates.name;
    if (updates.scopes) updateData.scopes = JSON.stringify(updates.scopes);
    if (updates.rateLimit) updateData.rate_limit = updates.rateLimit;

    await db('api_keys')
      .where({ id, organization_id: organizationId })
      .update(updateData);

    logger.info('API key updated', { keyId: id, organizationId });
  }

  /**
   * Check rate limit for API key
   */
  async checkRateLimit(keyId: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = await db('api_keys').where({ id: keyId }).first();

    if (!key) {
      return { allowed: false, remaining: 0 };
    }

    // Simple rate limiting (in production, use Redis)
    // For now, just return the configured limit
    return {
      allowed: true,
      remaining: key.rate_limit,
    };
  }
}

export const apiKeyService = new ApiKeyService();
