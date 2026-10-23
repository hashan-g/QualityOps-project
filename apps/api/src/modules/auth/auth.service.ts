import { authRepository } from './auth.repository.js';
import type { UserRecord } from './auth.repository.js';
import { PasswordService } from '../../infrastructure/security/password.service.js';
import { TokenService } from '../../infrastructure/security/token.service.js';
import { UnauthorizedError } from '../../middleware/error.middleware.js';
import { config } from '../../config.js';
import type { UserResponse } from '@qualityops/contracts';

export interface LoginResult {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface RefreshResult {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export class AuthService {
  public static toUserResponse(record: UserRecord): UserResponse {
    return {
      id: record.id,
      username: record.username,
      email: record.email,
      fullName: record.full_name,
      isActive: record.is_active,
      roles: record.roles,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    };
  }

  /**
   * Authenticates user with username/email and password.
   * Mitigates user enumeration timing attacks by running a dummy hash verification
   * when a username is not found.
   */
  public async login(
    usernameInput: string,
    passwordInput: string,
    metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined },
  ): Promise<LoginResult> {
    const user = await authRepository.findByUsernameOrEmail(usernameInput);

    if (!user) {
      await PasswordService.dummyVerify();
      throw new UnauthorizedError('Invalid username or password');
    }

    if (!user.is_active) {
      // Return identical generic error for disabled accounts to avoid state probing
      throw new UnauthorizedError('Invalid username or password');
    }

    const isMatch = await PasswordService.verifyPassword(user.password_hash, passwordInput);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid username or password');
    }

    // Sign JWT access token
    const { token: accessToken, expiresInSeconds } = TokenService.signAccessToken({
      userId: user.id,
      username: user.username,
      roles: user.roles,
    });

    // Generate and persist refresh token session (only token hash is stored)
    const rawRefreshToken = TokenService.generateRefreshToken();
    const tokenHash = TokenService.hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    await authRepository.createRefreshSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
    });

    return {
      user: AuthService.toUserResponse(user),
      accessToken,
      refreshToken: rawRefreshToken,
      expiresInSeconds,
    };
  }

  /**
   * Refreshes access token and rotates the refresh token.
   * If a revoked token is used, revokes all sessions for defense against token theft/replay.
   */
  public async refresh(
    rawRefreshToken: string,
    metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined },
  ): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    const tokenHash = TokenService.hashRefreshToken(rawRefreshToken);
    const session = await authRepository.findRefreshSessionByHash(tokenHash);

    if (!session) {
      throw new UnauthorizedError('Invalid or expired refresh session');
    }

    // Automatic token reuse detection
    if (session.revoked_at !== null) {
      // Possible token theft/replay attack detected! Revoke all sessions for this user.
      await authRepository.revokeAllUserSessions(session.user_id);
      throw new UnauthorizedError('Refresh session was previously revoked; please log in again');
    }

    if (new Date() > new Date(session.expires_at)) {
      await authRepository.revokeRefreshSession(session.id);
      throw new UnauthorizedError('Refresh session has expired');
    }

    const user = await authRepository.findById(session.user_id);
    if (!user || !user.is_active) {
      await authRepository.revokeRefreshSession(session.id);
      throw new UnauthorizedError('User account is deactivated');
    }

    // Revoke old session (Rotation)
    await authRepository.revokeRefreshSession(session.id);

    // Issue new credentials
    const { token: newAccessToken, expiresInSeconds } = TokenService.signAccessToken({
      userId: user.id,
      username: user.username,
      roles: user.roles,
    });

    const newRawRefreshToken = TokenService.generateRefreshToken();
    const newTokenHash = TokenService.hashRefreshToken(newRawRefreshToken);
    const expiresAt = new Date(
      Date.now() + config.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    await authRepository.createRefreshSession({
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt,
      userAgent: metadata?.userAgent ?? session.user_agent ?? undefined,
      ipAddress: metadata?.ipAddress ?? session.ip_address ?? undefined,
    });

    return {
      user: AuthService.toUserResponse(user),
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresInSeconds,
    };
  }

  /**
   * Revokes the active refresh token session. Safe to call repeatedly.
   */
  public async logout(rawRefreshToken?: string): Promise<{ success: boolean; message: string }> {
    if (rawRefreshToken) {
      const tokenHash = TokenService.hashRefreshToken(rawRefreshToken);
      await authRepository.revokeRefreshSessionByHash(tokenHash);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Retrieves the current user's safe profile and active roles.
   */
  public async getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await authRepository.findById(userId);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('User not found or account is deactivated');
    }

    return AuthService.toUserResponse(user);
  }
}

export const authService = new AuthService();
