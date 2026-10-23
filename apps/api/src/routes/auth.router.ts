import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { LoginRequestSchema, RefreshTokenRequestSchema } from '@qualityops/contracts';
import { authService } from '../modules/auth/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { loginRateLimiter, refreshRateLimiter } from '../middleware/rate-limiter.middleware.js';
import { BadRequestError, ForbiddenError } from '../middleware/error.middleware.js';
import { config } from '../config.js';

export const authRouter = Router();

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: (config.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  };
}

/**
 * Validates origin header against allowed CORS origin when cookie authentication is present.
 */
function validateOrigin(req: Request): void {
  const origin = req.headers.origin;
  if (origin && origin !== config.CORS_ORIGIN) {
    throw new ForbiddenError('Invalid request origin');
  }
}

// POST /api/v1/auth/login
authRouter.post(
  '/login',
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = LoginRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation error', parsed.error.issues);
      }

      const { username, password } = parsed.data;
      const result = await authService.login(username, password, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      // Set HttpOnly refresh token cookie
      res.cookie('refreshToken', result.refreshToken, getCookieOptions());

      res.status(200).json({
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresInSeconds,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/refresh
authRouter.post(
  '/refresh',
  refreshRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // CSRF protection: check origin when cookie is used
      if (req.cookies?.refreshToken) {
        validateOrigin(req);
      }

      const bodyParsed = RefreshTokenRequestSchema.safeParse(req.body ?? {});
      const token =
        (req.cookies?.refreshToken as string | undefined) ??
        (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

      if (!token) {
        throw new BadRequestError('Refresh token required in cookie or request body');
      }

      const result = await authService.refresh(token, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      // Rotate cookie with new refresh token
      res.cookie('refreshToken', result.refreshToken, getCookieOptions());

      res.status(200).json({
        accessToken: result.accessToken,
        expiresIn: result.expiresInSeconds,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/logout
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.cookies?.refreshToken) {
        validateOrigin(req);
      }

      const bodyParsed = RefreshTokenRequestSchema.safeParse(req.body ?? {});
      const token =
        (req.cookies?.refreshToken as string | undefined) ??
        (bodyParsed.success ? bodyParsed.data.refreshToken : undefined);

      await authService.logout(token);

      // Clear the refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: (config.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
        path: '/api/v1/auth',
      });

      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/auth/me
authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  },
);
