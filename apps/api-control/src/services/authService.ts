import bcrypt from 'bcrypt';
import { db } from '../config/database';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    // Check if user already exists
    const existingUser = await db('users').where({ email: input.email }).first();

    if (existingUser) {
      throw new AppError(409, 'User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Start transaction
    const result = await db.transaction(async (trx) => {
      // Create user
      const [user] = await trx('users')
        .insert({
          email: input.email,
          password_hash: passwordHash,
          name: input.name,
        })
        .returning('*');

      // Create organization if provided
      let organization;
      if (input.organizationName) {
        const slug = input.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        [organization] = await trx('organizations')
          .insert({
            name: input.organizationName,
            slug: `${slug}-${uuidv4().substring(0, 8)}`,
            plan: 'free',
          })
          .returning('*');

        // Add user as owner
        await trx('organization_members').insert({
          organization_id: organization.id,
          user_id: user.id,
          role: 'owner',
        });
      }

      return { user, organization };
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.organization?.id,
      role: 'owner',
    });

    const refreshToken = generateRefreshToken({
      userId: result.user.id,
      email: result.user.email,
    });

    // Store refresh token
    await db('refresh_tokens').insert({
      user_id: result.user.id,
      token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: result.organization
        ? {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.slug,
          }
        : null,
      accessToken,
      refreshToken,
    };
  }

  async login(input: LoginInput) {
    // Find user
    const user = await db('users').where({ email: input.email }).first();

    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(input.password, user.password_hash);

    if (!isValidPassword) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new AppError(403, 'Account is suspended or deleted');
    }

    // Get user's organization
    const membership = await db('organization_members')
      .where({ user_id: user.id })
      .first();

    let organization = null;
    if (membership) {
      organization = await db('organizations')
        .where({ id: membership.organization_id })
        .first();
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: organization?.id,
      role: membership?.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    // Store refresh token
    await db('refresh_tokens').insert({
      user_id: user.id,
      token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    // Update last login
    await db('users').where({ id: user.id }).update({
      last_login_at: new Date(),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            plan: organization.plan,
          }
        : null,
      accessToken,
      refreshToken,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      // Verify refresh token
      const payload = verifyRefreshToken(refreshToken);

      // Check if token exists and is not revoked
      const tokenRecord = await db('refresh_tokens')
        .where({
          token_hash: hashToken(refreshToken),
          is_revoked: false,
        })
        .first();

      if (!tokenRecord) {
        throw new AppError(401, 'Invalid refresh token');
      }

      // Check if token is expired
      if (new Date(tokenRecord.expires_at) < new Date()) {
        throw new AppError(401, 'Refresh token expired');
      }

      // Get user
      const user = await db('users').where({ id: payload.userId }).first();

      if (!user || user.status !== 'active') {
        throw new AppError(401, 'User not found or inactive');
      }

      // Get user's organization
      const membership = await db('organization_members')
        .where({ user_id: user.id })
        .first();

      // Generate new access token
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        organizationId: membership?.organization_id,
        role: membership?.role,
      });

      return { accessToken };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, 'Invalid refresh token');
    }
  }

  async logout(refreshToken: string) {
    // Revoke refresh token
    await db('refresh_tokens')
      .where({ token_hash: hashToken(refreshToken) })
      .update({ is_revoked: true });

    return { success: true };
  }
}

export const authService = new AuthService();
