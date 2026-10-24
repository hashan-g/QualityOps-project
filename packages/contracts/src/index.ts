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

// ============================================================================
// Phase 4: Master Data Management Contracts
// ============================================================================

export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid ID parameter; must be a valid UUID'),
});
export type IdParam = z.infer<typeof IdParamSchema>;

const booleanQueryPreprocess = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
}, z.boolean().optional());

export const BaseMasterDataQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  isActive: booleanQueryPreprocess,
});
export type BaseMasterDataQuery = z.infer<typeof BaseMasterDataQuerySchema>;

// 1. Products
export const ProductSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  description: z.string().nullable().optional(),
  targetCycleTimeSeconds: z.number().positive().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductRequestSchema = z.object({
  code: z.string().min(1, 'Product code is required').max(50).trim(),
  name: z.string().min(1, 'Product name is required').max(150).trim(),
  description: z.string().max(1000).nullable().optional(),
  targetCycleTimeSeconds: z
    .number()
    .positive('Target cycle time must be greater than zero')
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z.object({
  code: z.string().min(1, 'Product code cannot be empty').max(50).trim().optional(),
  name: z.string().min(1, 'Product name cannot be empty').max(150).trim().optional(),
  description: z.string().max(1000).nullable().optional(),
  targetCycleTimeSeconds: z
    .number()
    .positive('Target cycle time must be greater than zero')
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductListQuerySchema = BaseMasterDataQuerySchema;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductListResponseSchema = z.object({
  items: z.array(ProductSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

// 2. Production Lines
export const ProductionLineSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  location: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionLine = z.infer<typeof ProductionLineSchema>;

export const CreateProductionLineRequestSchema = z.object({
  code: z.string().min(1, 'Line code is required').max(50).trim(),
  name: z.string().min(1, 'Line name is required').max(100).trim(),
  location: z.string().max(100).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductionLineRequest = z.infer<typeof CreateProductionLineRequestSchema>;

export const UpdateProductionLineRequestSchema = z.object({
  code: z.string().min(1, 'Line code cannot be empty').max(50).trim().optional(),
  name: z.string().min(1, 'Line name cannot be empty').max(100).trim().optional(),
  location: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductionLineRequest = z.infer<typeof UpdateProductionLineRequestSchema>;

export const ProductionLineListQuerySchema = BaseMasterDataQuerySchema;
export type ProductionLineListQuery = z.infer<typeof ProductionLineListQuerySchema>;

export const ProductionLineListResponseSchema = z.object({
  items: z.array(ProductionLineSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type ProductionLineListResponse = z.infer<typeof ProductionLineListResponseSchema>;

// 3. Machines
export const MachineStatusSchema = z.enum(['IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE']);
export type MachineStatus = z.infer<typeof MachineStatusSchema>;

export const MachineSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  productionLineId: z.string().uuid(),
  productionLineName: z.string().optional(),
  status: MachineStatusSchema,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Machine = z.infer<typeof MachineSchema>;

export const CreateMachineRequestSchema = z.object({
  code: z.string().min(1, 'Machine code is required').max(50).trim(),
  name: z.string().min(1, 'Machine name is required').max(100).trim(),
  productionLineId: z.string().uuid('Valid productionLineId UUID is required'),
  status: MachineStatusSchema.default('IDLE'),
  isActive: z.boolean().default(true),
});
export type CreateMachineRequest = z.infer<typeof CreateMachineRequestSchema>;

export const UpdateMachineRequestSchema = z.object({
  code: z.string().min(1, 'Machine code cannot be empty').max(50).trim().optional(),
  name: z.string().min(1, 'Machine name cannot be empty').max(100).trim().optional(),
  productionLineId: z.string().uuid('Valid productionLineId UUID required').optional(),
  status: MachineStatusSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMachineRequest = z.infer<typeof UpdateMachineRequestSchema>;

export const MachineListQuerySchema = BaseMasterDataQuerySchema.extend({
  productionLineId: z.string().uuid().optional(),
  status: MachineStatusSchema.optional(),
});
export type MachineListQuery = z.infer<typeof MachineListQuerySchema>;

export const MachineListResponseSchema = z.object({
  items: z.array(MachineSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type MachineListResponse = z.infer<typeof MachineListResponseSchema>;

// 4. Shifts
const timeStringRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const ShiftSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  startTime: z.string(),
  endTime: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Shift = z.infer<typeof ShiftSchema>;

export const CreateShiftRequestSchema = z.object({
  code: z.string().min(1, 'Shift code is required').max(50).trim(),
  name: z.string().min(1, 'Shift name is required').max(100).trim(),
  startTime: z
    .string()
    .regex(timeStringRegex, 'startTime must be valid 24-hour time format (HH:mm or HH:mm:ss)'),
  endTime: z
    .string()
    .regex(timeStringRegex, 'endTime must be valid 24-hour time format (HH:mm or HH:mm:ss)'),
  isActive: z.boolean().default(true),
});
export type CreateShiftRequest = z.infer<typeof CreateShiftRequestSchema>;

export const UpdateShiftRequestSchema = z.object({
  code: z.string().min(1, 'Shift code cannot be empty').max(50).trim().optional(),
  name: z.string().min(1, 'Shift name cannot be empty').max(100).trim().optional(),
  startTime: z
    .string()
    .regex(timeStringRegex, 'startTime must be valid 24-hour time format (HH:mm or HH:mm:ss)')
    .optional(),
  endTime: z
    .string()
    .regex(timeStringRegex, 'endTime must be valid 24-hour time format (HH:mm or HH:mm:ss)')
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateShiftRequest = z.infer<typeof UpdateShiftRequestSchema>;

export const ShiftListQuerySchema = BaseMasterDataQuerySchema;
export type ShiftListQuery = z.infer<typeof ShiftListQuerySchema>;

export const ShiftListResponseSchema = z.object({
  items: z.array(ShiftSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type ShiftListResponse = z.infer<typeof ShiftListResponseSchema>;

// 5. Defect Types
export const DefectSeveritySchema = z.enum(['MINOR', 'MAJOR', 'CRITICAL']);
export type DefectSeverity = z.infer<typeof DefectSeveritySchema>;

export const DefectTypeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  severity: DefectSeveritySchema,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DefectType = z.infer<typeof DefectTypeSchema>;

export const CreateDefectTypeRequestSchema = z.object({
  code: z.string().min(1, 'Defect code is required').max(50).trim(),
  name: z.string().min(1, 'Defect name is required').max(100).trim(),
  category: z.string().min(1, 'Category is required').max(50).trim(),
  severity: DefectSeveritySchema.default('MINOR'),
  isActive: z.boolean().default(true),
});
export type CreateDefectTypeRequest = z.infer<typeof CreateDefectTypeRequestSchema>;

export const UpdateDefectTypeRequestSchema = z.object({
  code: z.string().min(1, 'Defect code cannot be empty').max(50).trim().optional(),
  name: z.string().min(1, 'Defect name cannot be empty').max(100).trim().optional(),
  category: z.string().min(1, 'Category cannot be empty').max(50).trim().optional(),
  severity: DefectSeveritySchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDefectTypeRequest = z.infer<typeof UpdateDefectTypeRequestSchema>;

export const DefectTypeListQuerySchema = BaseMasterDataQuerySchema.extend({
  category: z.string().optional(),
  severity: DefectSeveritySchema.optional(),
});
export type DefectTypeListQuery = z.infer<typeof DefectTypeListQuerySchema>;

export const DefectTypeListResponseSchema = z.object({
  items: z.array(DefectTypeSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type DefectTypeListResponse = z.infer<typeof DefectTypeListResponseSchema>;

// ==========================================
// Phase 5: Production Management Contracts
// ==========================================

// 1. Production Batches
export const BatchStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ON_HOLD',
]);
export type BatchStatus = z.infer<typeof BatchStatusSchema>;

export const ProductionBatchSchema = z.object({
  id: z.string().uuid(),
  batchNumber: z.string().min(1).max(100),
  productId: z.string().uuid(),
  productCode: z.string().optional(),
  productName: z.string().optional(),
  productionLineId: z.string().uuid(),
  productionLineCode: z.string().optional(),
  productionLineName: z.string().optional(),
  shiftId: z.string().uuid(),
  shiftCode: z.string().optional(),
  shiftName: z.string().optional(),
  machineId: z.string().uuid().nullable().optional(),
  machineCode: z.string().nullable().optional(),
  machineName: z.string().nullable().optional(),
  createdBy: z.string().uuid().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  status: BatchStatusSchema,
  plannedQuantity: z.number().int().positive(),
  producedQuantity: z.number().int().nonnegative(),
  acceptedQuantity: z.number().int().nonnegative(),
  scrapQuantity: z.number().int().nonnegative(),
  reworkPendingQuantity: z.number().int().nonnegative(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProductionBatch = z.infer<typeof ProductionBatchSchema>;

export const CreateProductionBatchRequestSchema = z.object({
  batchNumber: z.string().min(1, 'Batch number is required').max(100).trim(),
  productId: z.string().uuid('Valid product UUID is required'),
  productionLineId: z.string().uuid('Valid production line UUID is required'),
  shiftId: z.string().uuid('Valid shift UUID is required'),
  machineId: z.string().uuid('Valid machine UUID required').nullable().optional(),
  plannedQuantity: z
    .number({ invalid_type_error: 'Planned quantity must be a number' })
    .int('Planned quantity must be an integer')
    .positive('Planned quantity must be greater than zero'),
  status: BatchStatusSchema.optional().default('PLANNED'),
  startedAt: z.string().datetime().nullable().optional(),
});
export type CreateProductionBatchRequest = z.infer<typeof CreateProductionBatchRequestSchema>;

export const UpdateProductionBatchRequestSchema = z
  .object({
    machineId: z.string().uuid().nullable().optional(),
    producedQuantity: z.number().int().nonnegative().optional(),
    acceptedQuantity: z.number().int().nonnegative().optional(),
    scrapQuantity: z.number().int().nonnegative().optional(),
    reworkPendingQuantity: z.number().int().nonnegative().optional(),
    status: BatchStatusSchema.optional(),
    startedAt: z.string().datetime().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.producedQuantity !== undefined &&
      data.acceptedQuantity !== undefined &&
      data.scrapQuantity !== undefined &&
      data.reworkPendingQuantity !== undefined
    ) {
      const sum = data.acceptedQuantity + data.scrapQuantity + data.reworkPendingQuantity;
      if (sum > data.producedQuantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Disposition sum (accepted + scrap + rework) cannot exceed produced quantity',
          path: ['acceptedQuantity'],
        });
      }
      if (data.status === 'COMPLETED' && sum !== data.producedQuantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'When completing a batch, disposition sum (accepted + scrap + rework) must exactly equal produced quantity',
          path: ['status'],
        });
      }
    }

    if (data.startedAt && data.completedAt) {
      if (new Date(data.completedAt) < new Date(data.startedAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Completed timestamp cannot be earlier than started timestamp',
          path: ['completedAt'],
        });
      }
    }
  });
export type UpdateProductionBatchRequest = z.infer<typeof UpdateProductionBatchRequestSchema>;

export const ProductionBatchListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  productId: z.string().uuid().optional(),
  productionLineId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  status: BatchStatusSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ProductionBatchListQuery = z.infer<typeof ProductionBatchListQuerySchema>;

export const ProductionBatchListResponseSchema = z.object({
  items: z.array(ProductionBatchSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type ProductionBatchListResponse = z.infer<typeof ProductionBatchListResponseSchema>;

// 2. Downtime Records
export const DowntimeCategorySchema = z.enum(['PLANNED', 'UNPLANNED']);
export type DowntimeCategory = z.infer<typeof DowntimeCategorySchema>;

export const DowntimeRecordSchema = z.object({
  id: z.string().uuid(),
  productionLineId: z.string().uuid(),
  productionLineCode: z.string().optional(),
  productionLineName: z.string().optional(),
  machineId: z.string().uuid().nullable().optional(),
  machineCode: z.string().nullable().optional(),
  machineName: z.string().nullable().optional(),
  batchId: z.string().uuid().nullable().optional(),
  batchNumber: z.string().nullable().optional(),
  reason: z.string().min(1).max(100),
  category: DowntimeCategorySchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  recordedBy: z.string().uuid().nullable().optional(),
  recordedByName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DowntimeRecord = z.infer<typeof DowntimeRecordSchema>;

export const CreateDowntimeRequestSchema = z
  .object({
    productionLineId: z.string().uuid('Valid production line UUID is required'),
    machineId: z.string().uuid().nullable().optional(),
    batchId: z.string().uuid().nullable().optional(),
    reason: z
      .string()
      .min(1, 'Reason is required')
      .max(100, 'Reason cannot exceed 100 characters')
      .trim(),
    category: DowntimeCategorySchema.optional().default('UNPLANNED'),
    startedAt: z.string().datetime('Valid startedAt ISO timestamp is required'),
    endedAt: z.string().datetime().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startedAt && data.endedAt) {
      if (new Date(data.endedAt) <= new Date(data.startedAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Downtime end time must be strictly after start time',
          path: ['endedAt'],
        });
      }
    }
  });
export type CreateDowntimeRequest = z.infer<typeof CreateDowntimeRequestSchema>;

export const CloseDowntimeRequestSchema = z.object({
  endedAt: z.string().datetime('Valid endedAt ISO timestamp is required'),
  notes: z.string().max(1000).nullable().optional(),
});
export type CloseDowntimeRequest = z.infer<typeof CloseDowntimeRequestSchema>;

export const UpdateDowntimeRequestSchema = z.object({
  reason: z.string().min(1).max(100).trim().optional(),
  category: DowntimeCategorySchema.optional(),
  endedAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type UpdateDowntimeRequest = z.infer<typeof UpdateDowntimeRequestSchema>;

export const DowntimeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  productionLineId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  category: DowntimeCategorySchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type DowntimeListQuery = z.infer<typeof DowntimeListQuerySchema>;

export const DowntimeListResponseSchema = z.object({
  items: z.array(DowntimeRecordSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type DowntimeListResponse = z.infer<typeof DowntimeListResponseSchema>;
