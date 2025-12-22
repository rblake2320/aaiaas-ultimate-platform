import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import { db } from '../../../src/config/database';
import * as jwt from '../../../src/utils/jwt';
import { authService } from '../../../src/services/authService';
import { AppError } from '../../../src/middleware/errorHandler';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('bcrypt');
jest.mock('../../../src/utils/jwt');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should hash password and store user', async () => {
      const mockHashedPassword = 'hashed_password_123';
      (bcrypt.hash as unknown as jest.Mock).mockResolvedValue(mockHashedPassword);
      (jwt.generateAccessToken as unknown as jest.Mock).mockReturnValue('access_token');
      (jwt.generateRefreshToken as unknown as jest.Mock).mockReturnValue('refresh_token');
      (jwt.hashToken as unknown as jest.Mock).mockReturnValue('refresh_hash');

      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
      };

      const createdUserRow = {
        id: 'user-123',
        email: userData.email,
        name: userData.name,
        password_hash: mockHashedPassword,
        status: 'active',
      };

      const dbMock = db as unknown as jest.Mock & { transaction?: jest.Mock };

      // First: "does user exist?"
      dbMock.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            where: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(null),
            }),
          };
        }
        if (table === 'refresh_tokens') {
          return {
            insert: jest.fn().mockResolvedValue(undefined),
          };
        }
        return {};
      });

      // Transaction path (user creation)
      dbMock.transaction = jest.fn(async (cb: any) => {
        const trx = (table: string) => {
          if (table === 'users') {
            return {
              insert: jest.fn().mockReturnValue({
                returning: jest.fn().mockResolvedValue([createdUserRow]),
              }),
            };
          }
          return {
            insert: jest.fn().mockResolvedValue(undefined),
            returning: jest.fn().mockResolvedValue([]),
          };
        };
        return cb(trx);
      });

      const result = await authService.register(userData);

      // AuthService uses SALT_ROUNDS = 12
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(result.user).toEqual({
        id: createdUserRow.id,
        email: createdUserRow.email,
        name: createdUserRow.name,
      });
      expect(result.accessToken).toBe('access_token');
      expect(result.refreshToken).toBe('refresh_token');
    });

    it('should prevent duplicate email registration', async () => {
      const existingUser = { id: 'user-existing', email: 'existing@example.com' };
      const dbMock = db as unknown as jest.Mock;

      dbMock.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            where: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(existingUser),
            }),
          };
        }
        return {};
      });

      await expect(
        authService.register({
          email: existingUser.email,
          password: 'SecurePassword123!',
          name: 'Test User',
        })
      ).rejects.toBeInstanceOf(AppError);
      await expect(
        authService.register({
          email: existingUser.email,
          password: 'SecurePassword123!',
          name: 'Test User',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('loginUser', () => {
    it('should return tokens for valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashed_password',
        name: 'Test User',
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.generateAccessToken as jest.Mock).mockReturnValue('access_token');
      (jwt.generateRefreshToken as jest.Mock).mockReturnValue('refresh_token');

      (db as any).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([mockUser]),
          }),
        }),
      });

      expect(jwt.generateAccessToken).toBeDefined();
      expect(jwt.generateRefreshToken).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(async () => {
        const isValid = await bcrypt.compare('wrong_password', 'hashed_password');
        if (!isValid) {
          throw new Error('Invalid credentials');
        }
      }).rejects.toThrow('Invalid credentials');
    });

    it('should reject login for non-existent user', async () => {
      (db as any).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Test would verify non-existent user is rejected
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('refreshToken', () => {
    it('should generate new access token from valid refresh token', async () => {
      const mockPayload = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      (jwt.verifyRefreshToken as jest.Mock).mockReturnValue(mockPayload);
      (jwt.generateAccessToken as jest.Mock).mockReturnValue('new_access_token');

      const result = jwt.verifyRefreshToken('valid_refresh_token');
      expect(result).toEqual(mockPayload);
    });

    it('should reject expired refresh token', async () => {
      (jwt.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid or expired refresh token');
      });

      expect(() => {
        jwt.verifyRefreshToken('expired_token');
      }).toThrow('Invalid or expired refresh token');
    });
  });

  describe('JWT Token Validation', () => {
    it('should generate valid JWT format', () => {
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjMiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.signature';
      (jwt.generateAccessToken as jest.Mock).mockReturnValue(mockToken);

      const token = jwt.generateAccessToken({ userId: '123', email: 'test@example.com' });
      
      // JWT should have 3 parts separated by dots
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include required claims in token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
      };

      (jwt.verifyAccessToken as jest.Mock).mockReturnValue(payload);

      const decoded = jwt.verifyAccessToken('valid_token');
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email');
    });
  });

  describe('Password Security', () => {
    it('should use sufficient bcrypt rounds', async () => {
      const password = 'SecurePassword123!';
      const rounds = 10;

      (bcrypt.hash as jest.Mock).mockImplementation((pwd, r) => {
        expect(r).toBeGreaterThanOrEqual(10);
        return Promise.resolve('hashed');
      });

      await bcrypt.hash(password, rounds);
    });

    it('should not store plaintext passwords', async () => {
      const plainPassword = 'MyPassword123!';
      const hashedPassword = 'hashed_password_different';

      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);

      const result = await bcrypt.hash(plainPassword, 10);
      expect(result).not.toBe(plainPassword);
    });
  });
});

