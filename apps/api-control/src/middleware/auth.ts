import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, hashToken } from '../utils/jwt';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    organizationId?: string;
    role?: string;
  };
  organization?: {
    id: string;
    name: string;
    plan: string;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }

    const [type, token] = authHeader.split(' ');

    if (type === 'Bearer') {
      // JWT token authentication
      try {
        const payload = verifyAccessToken(token);
        req.user = {
          id: payload.userId,
          email: payload.email,
          organizationId: payload.organizationId,
          role: payload.role,
        };
        next();
      } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    } else if (type === 'ApiKey') {
      // API key authentication
      const keyHash = hashToken(token);
      const apiKey = await db('api_keys')
        .where({ key_hash: keyHash, is_active: true })
        .first();

      if (!apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check if key is expired
      if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
        return res.status(401).json({ error: 'API key has expired' });
      }

      // Update last used timestamp
      await db('api_keys')
        .where({ id: apiKey.id })
        .update({ last_used_at: new Date() });

      // Get organization
      const organization = await db('organizations')
        .where({ id: apiKey.organization_id })
        .first();

      req.organization = {
        id: organization.id,
        name: organization.name,
        plan: organization.plan,
      };

      next();
    } else {
      return res.status(401).json({ error: 'Invalid authorization type' });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

export async function loadOrganization(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user?.organizationId) {
      return next();
    }

    const organization = await db('organizations')
      .where({ id: req.user.organizationId })
      .first();

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    req.organization = {
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
    };

    next();
  } catch (error) {
    logger.error('Load organization error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
