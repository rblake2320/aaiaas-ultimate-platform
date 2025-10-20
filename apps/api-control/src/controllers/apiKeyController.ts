import { Request, Response } from 'express';
import { z } from 'zod';
import { apiKeyService } from '../services/apiKeyService';
import { logger } from '../utils/logger';

const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()).optional(),
  rateLimit: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string()).optional(),
  rateLimit: z.number().positive().optional(),
});

export class ApiKeyController {
  async create(req: any, res: Response) {
    const input = createApiKeySchema.parse(req.body);
    const userId = req.user.id;
    const organizationId = req.organization.id;

    const result = await apiKeyService.createApiKey({
      name: input.name,
      organizationId,
      userId,
      scopes: input.scopes,
      rateLimit: input.rateLimit,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    });

    logger.info('API key created', { keyId: result.id, organizationId });

    res.status(201).json({
      id: result.id,
      key: result.key,
      message: 'API key created successfully. Save this key securely - it will not be shown again.',
    });
  }

  async list(req: any, res: Response) {
    const organizationId = req.organization.id;

    const keys = await apiKeyService.listApiKeys(organizationId);

    res.json({ apiKeys: keys });
  }

  async get(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const key = await apiKeyService.getApiKey(id, organizationId);

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json(key);
  }

  async update(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;
    const input = updateApiKeySchema.parse(req.body);

    const key = await apiKeyService.getApiKey(id, organizationId);

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await apiKeyService.updateApiKey(id, organizationId, input);

    logger.info('API key updated', { keyId: id, organizationId });

    res.json({ message: 'API key updated successfully' });
  }

  async revoke(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const key = await apiKeyService.getApiKey(id, organizationId);

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await apiKeyService.revokeApiKey(id, organizationId);

    logger.info('API key revoked', { keyId: id, organizationId });

    res.json({ message: 'API key revoked successfully' });
  }

  async delete(req: any, res: Response) {
    const { id } = req.params;
    const organizationId = req.organization.id;

    const key = await apiKeyService.getApiKey(id, organizationId);

    if (!key) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await apiKeyService.deleteApiKey(id, organizationId);

    logger.info('API key deleted', { keyId: id, organizationId });

    res.json({ message: 'API key deleted successfully' });
  }
}

export const apiKeyController = new ApiKeyController();
