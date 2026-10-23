import { z } from 'zod';

// ============================================================================
// Health & Diagnostic Contracts
// ============================================================================

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'error']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime(),
  service: z.string().min(1),
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DatabaseStatusSchema = z.enum(['up', 'down', 'degraded']);
export type DatabaseStatus = z.infer<typeof DatabaseStatusSchema>;

export const HealthReadinessResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime(),
  service: z.string().min(1),
  version: z.string().min(1),
  database: z.object({
    status: DatabaseStatusSchema,
    latencyMs: z.number().nonnegative().optional(),
    error: z.string().optional(),
  }),
});
export type HealthReadinessResponse = z.infer<typeof HealthReadinessResponseSchema>;

// ============================================================================
// Identity & RBAC Contracts
// ============================================================================

export const CanonicalRoleSchema = z.enum([
  'ADMIN',
  'QUALITY_MANAGER',
  'SUPERVISOR',
  'INSPECTOR',
  'OPERATOR',
  'VIEWER',
]);
export type CanonicalRole = z.infer<typeof CanonicalRoleSchema>;

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  isActive: z.boolean(),
  roles: z.array(CanonicalRoleSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

// Authentication Request & Response
export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: UserResponseSchema,
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  user: UserResponseSchema,
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

// User Management Contracts (Admin Only)
export const CreateUserRequestSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username may only contain alphanumeric characters, underscores, or hyphens',
    ),
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  fullName: z.string().min(1, 'Full name is required').max(100),
  isActive: z.boolean().default(true),
  roles: z
    .array(CanonicalRoleSchema)
    .min(1, 'At least one role must be assigned')
    .default(['VIEWER']),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  email: z.string().email('Invalid email address').max(255).optional(),
  fullName: z.string().min(1, 'Full name cannot be empty').max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const AssignUserRolesRequestSchema = z.object({
  roles: z.array(CanonicalRoleSchema).min(1, 'At least one role must be provided'),
});
export type AssignUserRolesRequest = z.infer<typeof AssignUserRolesRequestSchema>;

export const UserListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  role: CanonicalRoleSchema.optional(),
  isActive: z.preprocess((val) => {
    if (typeof val === 'string') {
      if (val.toLowerCase() === 'true') return true;
      if (val.toLowerCase() === 'false') return false;
    }
    return val;
  }, z.boolean().optional()),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const UserListResponseSchema = z.object({
  users: z.array(UserResponseSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
