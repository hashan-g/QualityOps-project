import { userRepository } from './user.repository.js';
import type { UserListFilter } from './user.repository.js';
import { authRepository } from '../auth/auth.repository.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../../infrastructure/security/password.service.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../middleware/error.middleware.js';
import type {
  CanonicalRole,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  UserResponse,
} from '@qualityops/contracts';

export class UserService {
  /**
   * Retrieves a paginated list of users.
   */
  public async listUsers(filter: UserListFilter): Promise<UserListResponse> {
    const { users, total } = await userRepository.listUsers(filter);
    const totalPages = Math.ceil(total / filter.limit);

    return {
      users: users.map(AuthService.toUserResponse),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages,
    };
  }

  /**
   * Retrieves a single user by ID.
   */
  public async getUserById(id: string): Promise<UserResponse> {
    const user = await authRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found: ${id}`);
    }
    return AuthService.toUserResponse(user);
  }

  /**
   * Creates a new user with hashed password and assigned roles.
   */
  public async createUser(data: CreateUserRequest): Promise<UserResponse> {
    // 1. Check for duplicate username or email
    const existing = await authRepository.findByUsernameOrEmail(data.username);
    if (existing) {
      throw new ConflictError('A user with that username already exists');
    }

    const existingEmail = await authRepository.findByUsernameOrEmail(data.email);
    if (existingEmail) {
      throw new ConflictError('A user with that email already exists');
    }

    // 2. Validate roles against database
    const availableRoles = await userRepository.getAvailableRoles();
    const availableRoleNames = new Set(availableRoles.map((r) => r.name));
    for (const role of data.roles) {
      if (!availableRoleNames.has(role)) {
        throw new BadRequestError(`Role '${role}' does not exist in the database`);
      }
    }

    // 3. Hash password with Argon2id
    const passwordHash = await PasswordService.hashPassword(data.password);

    // 4. Create user record
    const created = await userRepository.createUser({
      username: data.username,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      isActive: data.isActive,
      roles: data.roles,
    });

    return AuthService.toUserResponse(created);
  }

  /**
   * Updates allowed profile attributes or password for a user.
   */
  public async updateUser(
    id: string,
    updates: UpdateUserRequest,
    currentAdminId: string,
  ): Promise<UserResponse> {
    const user = await authRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found: ${id}`);
    }

    // Prevent self-deactivation of admin accounts
    if (id === currentAdminId && updates.isActive === false) {
      throw new BadRequestError('Administrators cannot deactivate their own account');
    }

    // Check duplicate email
    if (updates.email && updates.email !== user.email) {
      const emailConflict = await authRepository.findByUsernameOrEmail(updates.email);
      if (emailConflict && emailConflict.id !== id) {
        throw new ConflictError('Email is already registered to another account');
      }
    }

    let passwordHash: string | undefined;
    if (updates.password) {
      passwordHash = await PasswordService.hashPassword(updates.password);
    }

    await userRepository.updateUser(id, {
      email: updates.email,
      fullName: updates.fullName,
      isActive: updates.isActive,
      passwordHash,
    });

    const updated = await authRepository.findById(id);
    if (!updated) {
      throw new NotFoundError(`User not found: ${id}`);
    }

    return AuthService.toUserResponse(updated);
  }

  /**
   * Assigns or updates roles for a user.
   */
  public async assignRoles(
    id: string,
    roles: CanonicalRole[],
    currentAdminId: string,
  ): Promise<UserResponse> {
    const user = await authRepository.findById(id);
    if (!user) {
      throw new NotFoundError(`User not found: ${id}`);
    }

    // Prevent self-demotion
    if (id === currentAdminId && !roles.includes('ADMIN')) {
      throw new BadRequestError('Administrators cannot remove their own ADMIN role');
    }

    // Validate roles exist
    const availableRoles = await userRepository.getAvailableRoles();
    const availableRoleNames = new Set(availableRoles.map((r) => r.name));
    for (const role of roles) {
      if (!availableRoleNames.has(role)) {
        throw new BadRequestError(`Role '${role}' does not exist in the database`);
      }
    }

    await userRepository.assignRoles(id, roles);

    const updated = await authRepository.findById(id);
    if (!updated) {
      throw new NotFoundError(`User not found: ${id}`);
    }

    return AuthService.toUserResponse(updated);
  }
}

export const userService = new UserService();
