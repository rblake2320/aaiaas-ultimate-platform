import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { logger } from '../utils/logger';

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
  refreshToken: z.string(),
});

export class AuthController {
  async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body);

    const result = await authService.register(input);

    logger.info('User registered', { userId: result.user.id, email: result.user.email });

    res.status(201).json(result);
  }

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);

    const result = await authService.login(input);

    logger.info('User logged in', { userId: result.user.id, email: result.user.email });

    res.json(result);
  }

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);

    const result = await authService.refreshAccessToken(refreshToken);

    res.json(result);
  }

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);

    await authService.logout(refreshToken);

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
