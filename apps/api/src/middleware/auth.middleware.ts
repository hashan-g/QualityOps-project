import type { NextFunction, Request, Response } from 'express';
import { TokenService } from '../infrastructure/security/token.service.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { ForbiddenError, UnauthorizedError } from './error.middleware.js';
import type { CanonicalRole } from '@qualityops/contracts';

export interface AuthenticatedUser {
  id: string;
  username: string;
  roles: CanonicalRole[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that validates the JWT access token from the Authorization header.
 * Also checks the database to verify the user account has not been deactivated.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorizedError('Authentication token required'));
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    next(new UnauthorizedError('Authentication token required'));
    return;
  }

  try {
    const payload = TokenService.verifyAccessToken(token);

    // Verify user is still active in the database (ensures instant revocation for disabled users)
    const user = await authRepository.findById(payload.sub);
    if (!user || !user.is_active) {
      next(new UnauthorizedError('User account is deactivated or no longer exists'));
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      roles: user.roles,
    };

    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

/**
 * Middleware factory enforcing Role-Based Access Control (RBAC).
 */
export function requireRole(allowedRoles: CanonicalRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    const hasAllowedRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasAllowedRole) {
      next(
        new ForbiddenError(
          `Insufficient permissions. Required one of: [${allowedRoles.join(', ')}]`,
        ),
      );
      return;
    }

    next();
  };
}
