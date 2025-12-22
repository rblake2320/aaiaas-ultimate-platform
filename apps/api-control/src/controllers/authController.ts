import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  organizationName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

function setRefreshTokenCookie(res: Response, refreshToken: string) {
  const isProd = env.NODE_ENV === 'production';
  // Keep cookie scoped to auth routes
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearRefreshTokenCookie(res: Response) {
  const isProd = env.NODE_ENV === 'production';
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
}

export class AuthController {
  async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body);

    const result = await authService.register(input);

    logger.info('User registered', { userId: result.user.id, email: result.user.email });

    // Prefer HttpOnly cookie storage for refresh token (mitigates XSS token theft).
    setRefreshTokenCookie(res, result.refreshToken);

    res.status(201).json(result);
  }

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);

    const result = await authService.login(input);

    logger.info('User logged in', { userId: result.user.id, email: result.user.email });

    // Prefer HttpOnly cookie storage for refresh token (mitigates XSS token theft).
    setRefreshTokenCookie(res, result.refreshToken);

    res.json(result);
  }

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    const tokenFromCookie = (req as any).cookies?.refreshToken as string | undefined;
    const token = refreshToken || tokenFromCookie;

    if (!token) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const result = await authService.refreshAccessToken(token);

    res.json(result);
  }

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    const tokenFromCookie = (req as any).cookies?.refreshToken as string | undefined;
    const token = refreshToken || tokenFromCookie;

    if (token) {
      await authService.logout(token);
    }

    clearRefreshTokenCookie(res);

    res.json({ message: 'Logged out successfully' });
  }

  async me(req: any, res: Response) {
    const userId = req.user.id;

    // This would typically fetch full user profile
    // For now, return what we have from the token
    res.json({
      user: req.user,
      organization: req.organization,
    });
  }
}

export const authController = new AuthController();
