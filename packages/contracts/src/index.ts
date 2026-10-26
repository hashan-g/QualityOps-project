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

// ==============================================================================
// Phase 6: Quality Inspection Management Schemas & Contracts
// ==============================================================================

export const InspectionStageSchema = z.enum(['IN_PROCESS', 'FINAL', 'RECEIVING', 'FIRST_ARTICLE']);
export type InspectionStage = z.infer<typeof InspectionStageSchema>;

export const InspectionStatusSchema = z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;

export const InspectionResultSchema = z.enum(['PASS', 'FAIL', 'CONDITIONAL']);
export type InspectionResult = z.infer<typeof InspectionResultSchema>;

export const QualityInspectionSchema = z.object({
  id: z.string().uuid(),
  inspectionNumber: z.string(),
  batchId: z.string().uuid(),
  inspectorId: z.string().uuid(),
  stage: z.string(),
  attemptNumber: z.number().int().positive(),
  status: InspectionStatusSchema,
  result: InspectionResultSchema.nullable(),
  sampleSize: z.number().int().positive(),
  passedUnits: z.number().int().nonnegative(),
  failedUnits: z.number().int().nonnegative(),
  inspectedAt: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Joined context
  batchNumber: z.string().optional(),
  productCode: z.string().optional(),
  productName: z.string().optional(),
  inspectorUsername: z.string().optional(),
  inspectorFullName: z.string().optional(),
});
export type QualityInspection = z.infer<typeof QualityInspectionSchema>;

export const CreateInspectionRequestSchema = z
  .object({
    batchId: z.string().uuid(),
    stage: z.string().min(1).max(50),
    attemptNumber: z.number().int().positive().optional(),
    sampleSize: z.number().int().positive({ message: 'Sample size must be a positive integer' }),
    passedUnits: z.number().int().nonnegative().default(0),
    failedUnits: z.number().int().nonnegative().default(0),
    status: InspectionStatusSchema.default('COMPLETED'),
    result: InspectionResultSchema.optional(),
    inspectedAt: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => data.passedUnits + data.failedUnits <= data.sampleSize, {
    message: 'Sum of passed and failed units cannot exceed sample size',
    path: ['passedUnits'],
  })
  .refine(
    (data) =>
      data.status !== 'COMPLETED' || data.passedUnits + data.failedUnits === data.sampleSize,
    {
      message: 'For completed inspections, passed + failed units must equal sample size',
      path: ['passedUnits'],
    },
  )
  .refine(
    (data) => {
      if (data.result === 'PASS' && data.failedUnits > 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Inspection result cannot be PASS when there are failed units',
      path: ['result'],
    },
  );
export type CreateInspectionRequest = z.infer<typeof CreateInspectionRequestSchema>;

export const UpdateInspectionRequestSchema = z
  .object({
    sampleSize: z.number().int().positive().optional(),
    passedUnits: z.number().int().nonnegative().optional(),
    failedUnits: z.number().int().nonnegative().optional(),
    status: InspectionStatusSchema.optional(),
    result: InspectionResultSchema.optional(),
    notes: z.string().max(2000).optional(),
    inspectedAt: z.string().datetime().optional(),
    reasonForCorrection: z.string().min(1).max(500).optional(),
  })
  .refine(
    (data) => {
      if (
        data.sampleSize !== undefined &&
        data.passedUnits !== undefined &&
        data.failedUnits !== undefined
      ) {
        return data.passedUnits + data.failedUnits <= data.sampleSize;
      }
      return true;
    },
    {
      message: 'Sum of passed and failed units cannot exceed sample size',
      path: ['passedUnits'],
    },
  )
  .refine(
    (data) => {
      if (
        data.status === 'COMPLETED' &&
        data.sampleSize !== undefined &&
        data.passedUnits !== undefined &&
        data.failedUnits !== undefined
      ) {
        return data.passedUnits + data.failedUnits === data.sampleSize;
      }
      return true;
    },
    {
      message: 'For completed inspections, passed + failed units must equal sample size',
      path: ['passedUnits'],
    },
  )
  .refine(
    (data) => {
      if (data.result === 'PASS' && data.failedUnits !== undefined && data.failedUnits > 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Inspection result cannot be PASS when there are failed units',
      path: ['result'],
    },
  );
export type UpdateInspectionRequest = z.infer<typeof UpdateInspectionRequestSchema>;

export const InspectionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  batchId: z.string().uuid().optional(),
  stage: z.string().optional(),
  status: InspectionStatusSchema.optional(),
  result: InspectionResultSchema.optional(),
  inspectorId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type InspectionListQuery = z.infer<typeof InspectionListQuerySchema>;

export const InspectionListResponseSchema = z.object({
  items: z.array(QualityInspectionSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type InspectionListResponse = z.infer<typeof InspectionListResponseSchema>;

// ==========================================
// Phase 7: Defect Management & Analytics Contracts
// ==========================================

export const DefectRecordSchema = z.object({
  id: z.string().uuid(),
  inspectionId: z.string().uuid(),
  defectTypeId: z.string().uuid(),
  occurrenceCount: z.number().int().positive(),
  affectedUnitCount: z.number().int().positive(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Joined context fields
  defectTypeCode: z.string().optional(),
  defectTypeName: z.string().optional(),
  defectTypeCategory: z.string().optional(),
  defectTypeSeverity: DefectSeveritySchema.optional(),
  inspectionNumber: z.string().optional(),
  inspectionStage: z.string().optional(),
  batchId: z.string().uuid().optional(),
  batchNumber: z.string().optional(),
  productId: z.string().uuid().optional(),
  productCode: z.string().optional(),
  productName: z.string().optional(),
  productionLineId: z.string().uuid().optional(),
  productionLineCode: z.string().optional(),
  productionLineName: z.string().optional(),
  machineId: z.string().uuid().nullable().optional(),
  machineCode: z.string().nullable().optional(),
  machineName: z.string().nullable().optional(),
  shiftId: z.string().uuid().optional(),
  shiftCode: z.string().optional(),
  shiftName: z.string().optional(),
});
export type DefectRecord = z.infer<typeof DefectRecordSchema>;

export const CreateDefectRecordRequestSchema = z
  .object({
    inspectionId: z.string().uuid('Valid inspection ID is required'),
    defectTypeId: z.string().uuid('Valid defect type ID is required'),
    occurrenceCount: z.number().int().positive('Occurrence count must be at least 1'),
    affectedUnitCount: z.number().int().positive('Affected unit count must be at least 1'),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => data.affectedUnitCount <= data.occurrenceCount, {
    message: 'Affected unit count cannot exceed occurrence count',
    path: ['affectedUnitCount'],
  });
export type CreateDefectRecordRequest = z.infer<typeof CreateDefectRecordRequestSchema>;

export const UpdateDefectRecordRequestSchema = z
  .object({
    occurrenceCount: z.number().int().positive('Occurrence count must be at least 1').optional(),
    affectedUnitCount: z
      .number()
      .int()
      .positive('Affected unit count must be at least 1')
      .optional(),
    notes: z.string().max(2000).optional(),
    reasonForCorrection: z
      .string()
      .min(1, 'Reason for correction is required for the audit trail')
      .max(500),
  })
  .refine(
    (data) => {
      if (data.occurrenceCount !== undefined && data.affectedUnitCount !== undefined) {
        return data.affectedUnitCount <= data.occurrenceCount;
      }
      return true;
    },
    {
      message: 'Affected unit count cannot exceed occurrence count',
      path: ['affectedUnitCount'],
    },
  );
export type UpdateDefectRecordRequest = z.infer<typeof UpdateDefectRecordRequestSchema>;

export const DefectRecordListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  inspectionId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  defectTypeId: z.string().uuid().optional(),
  severity: DefectSeveritySchema.optional(),
  productId: z.string().uuid().optional(),
  productionLineId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type DefectRecordListQuery = z.infer<typeof DefectRecordListQuerySchema>;

export const DefectRecordListResponseSchema = z.object({
  items: z.array(DefectRecordSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type DefectRecordListResponse = z.infer<typeof DefectRecordListResponseSchema>;

// Analytics Schemas
export const DefectAnalyticsFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  batchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  productionLineId: z.string().uuid().optional(),
  machineId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  defectTypeId: z.string().uuid().optional(),
  severity: DefectSeveritySchema.optional(),
  trendInterval: z.enum(['DAY', 'WEEK', 'MONTH']).default('DAY').optional(),
});
export type DefectAnalyticsFilter = z.infer<typeof DefectAnalyticsFilterSchema>;

export const DefectAnalyticsOverviewSchema = z.object({
  totalFindings: z.number().nonnegative(),
  totalOccurrences: z.number().nonnegative(),
  totalAffectedUnitsAcrossFindings: z.number().nonnegative(),
});
export type DefectAnalyticsOverview = z.infer<typeof DefectAnalyticsOverviewSchema>;

export const DefectByTypeItemSchema = z.object({
  defectTypeId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  severity: DefectSeveritySchema,
  findingCount: z.number().nonnegative(),
  occurrenceCount: z.number().nonnegative(),
  affectedUnitCount: z.number().nonnegative(),
});
export type DefectByTypeItem = z.infer<typeof DefectByTypeItemSchema>;

export const DefectBySeverityItemSchema = z.object({
  severity: DefectSeveritySchema,
  findingCount: z.number().nonnegative(),
  occurrenceCount: z.number().nonnegative(),
  affectedUnitCount: z.number().nonnegative(),
});
export type DefectBySeverityItem = z.infer<typeof DefectBySeverityItemSchema>;

export const DefectByEntityItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  findingCount: z.number().nonnegative(),
  occurrenceCount: z.number().nonnegative(),
  affectedUnitCount: z.number().nonnegative(),
});
export type DefectByEntityItem = z.infer<typeof DefectByEntityItemSchema>;

export const DefectTrendItemSchema = z.object({
  period: z.string(),
  findingCount: z.number().nonnegative(),
  occurrenceCount: z.number().nonnegative(),
  affectedUnitCount: z.number().nonnegative(),
});
export type DefectTrendItem = z.infer<typeof DefectTrendItemSchema>;

export const DefectParetoItemSchema = z.object({
  defectTypeId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  severity: DefectSeveritySchema,
  measure: z.enum(['affectedUnitCount', 'occurrenceCount', 'findingCount']),
  value: z.number().nonnegative(),
  percentage: z.number().nonnegative(),
  cumulativePercentage: z.number().nonnegative(),
});
export type DefectParetoItem = z.infer<typeof DefectParetoItemSchema>;

export const DefectAnalyticsResponseSchema = z.object({
  overview: DefectAnalyticsOverviewSchema,
  byType: z.array(DefectByTypeItemSchema),
  bySeverity: z.array(DefectBySeverityItemSchema),
  byProduct: z.array(DefectByEntityItemSchema),
  byProductionLine: z.array(DefectByEntityItemSchema),
  byMachine: z.array(DefectByEntityItemSchema),
  byShift: z.array(DefectByEntityItemSchema),
  trend: z.array(DefectTrendItemSchema),
  pareto: z.array(DefectParetoItemSchema),
});
export type DefectAnalyticsResponse = z.infer<typeof DefectAnalyticsResponseSchema>;

// ============================================================================
// CAPA Management Contracts (Phase 8)
// ============================================================================

export const CapaSourceSchema = z.enum([
  'INSPECTION_FAILURE',
  'INTERNAL_AUDIT',
  'CUSTOMER_COMPLAINT',
  'RECURRING_DEFECT',
  'PROCESS_DEVIATION',
]);
export type CapaSource = z.infer<typeof CapaSourceSchema>;

export const CapaStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'UNDER_REVIEW',
  'CLOSED',
  'CANCELLED',
]);
export type CapaStatus = z.infer<typeof CapaStatusSchema>;

export const CapaPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type CapaPriority = z.infer<typeof CapaPrioritySchema>;

export const CapaActionTypeSchema = z.enum(['CORRECTIVE', 'PREVENTIVE', 'IMMEDIATE_CONTAINMENT']);
export type CapaActionType = z.infer<typeof CapaActionTypeSchema>;

export const CapaActionStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED',
]);
export type CapaActionStatus = z.infer<typeof CapaActionStatusSchema>;

export const CapaActionSchema = z.object({
  id: z.string().uuid(),
  capaCaseId: z.string().uuid(),
  actionType: CapaActionTypeSchema,
  description: z.string().min(1),
  assignedTo: z.string().uuid().nullable().optional(),
  assignedToName: z.string().nullable().optional(),
  assignedToUsername: z.string().nullable().optional(),
  status: CapaActionStatusSchema,
  dueDate: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  completionNotes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CapaAction = z.infer<typeof CapaActionSchema>;

export const CapaCaseSchema = z.object({
  id: z.string().uuid(),
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  source: CapaSourceSchema,
  priority: CapaPrioritySchema,
  status: CapaStatusSchema,
  batchId: z.string().uuid().nullable().optional(),
  batchNumber: z.string().nullable().optional(),
  defectRecordId: z.string().uuid().nullable().optional(),
  defectCode: z.string().nullable().optional(),
  defectName: z.string().nullable().optional(),
  defectSeverity: DefectSeveritySchema.nullable().optional(),
  inspectionId: z.string().uuid().nullable().optional(),
  inspectionNumber: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  assignedToName: z.string().nullable().optional(),
  assignedToUsername: z.string().nullable().optional(),
  createdBy: z.string().uuid(),
  createdByName: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  rootCause: z.string().nullable().optional(),
  verifiedBy: z.string().uuid().nullable().optional(),
  verifiedByName: z.string().nullable().optional(),
  verifiedAt: z.string().datetime().nullable().optional(),
  verificationNotes: z.string().nullable().optional(),
  actionCount: z.number().int().nonnegative(),
  completedActionCount: z.number().int().nonnegative(),
  isOverdue: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CapaCase = z.infer<typeof CapaCaseSchema>;

export const CreateCapaCaseRequestSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  source: CapaSourceSchema,
  priority: CapaPrioritySchema.default('MEDIUM'),
  batchId: z.string().uuid().optional(),
  defectRecordId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .optional(),
  rootCause: z.string().max(4000).optional(),
});
export type CreateCapaCaseRequest = z.infer<typeof CreateCapaCaseRequestSchema>;

export const UpdateCapaCaseRequestSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(5).optional(),
  source: CapaSourceSchema.optional(),
  priority: CapaPrioritySchema.optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  rootCause: z.string().max(4000).nullable().optional(),
  status: CapaStatusSchema.optional(),
  changeReason: z.string().min(5, 'Change reason must be at least 5 characters').optional(),
});
export type UpdateCapaCaseRequest = z.infer<typeof UpdateCapaCaseRequestSchema>;

export const VerifyCapaCaseRequestSchema = z.object({
  result: z.enum(['PASS', 'FAIL']),
  notes: z.string().min(5, 'Verification notes must be at least 5 characters').max(2000),
});
export type VerifyCapaCaseRequest = z.infer<typeof VerifyCapaCaseRequestSchema>;

export const CloseCapaCaseRequestSchema = z.object({
  closureNotes: z.string().max(2000).optional(),
});
export type CloseCapaCaseRequest = z.infer<typeof CloseCapaCaseRequestSchema>;

export const CreateCapaActionRequestSchema = z.object({
  actionType: CapaActionTypeSchema,
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  assignedTo: z.string().uuid().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .optional(),
});
export type CreateCapaActionRequest = z.infer<typeof CreateCapaActionRequestSchema>;

export const UpdateCapaActionRequestSchema = z.object({
  description: z.string().min(5).max(2000).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  status: CapaActionStatusSchema.optional(),
});
export type UpdateCapaActionRequest = z.infer<typeof UpdateCapaActionRequestSchema>;

export const CompleteCapaActionRequestSchema = z.object({
  completionNotes: z.string().min(5, 'Completion notes must be at least 5 characters').max(2000),
});
export type CompleteCapaActionRequest = z.infer<typeof CompleteCapaActionRequestSchema>;

export const CapaCaseListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
  search: z.string().optional(),
  status: CapaStatusSchema.optional(),
  priority: CapaPrioritySchema.optional(),
  source: CapaSourceSchema.optional(),
  assignedTo: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  defectRecordId: z.string().uuid().optional(),
  overdue: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z
    .enum(['created_at', 'due_date', 'case_number', 'priority', 'status'])
    .default('created_at')
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});
export type CapaCaseListQuery = z.infer<typeof CapaCaseListQuerySchema>;

export const CapaCaseListResponseSchema = z.object({
  items: z.array(CapaCaseSchema),
  total: z.number().nonnegative(),
  page: z.number().positive(),
  limit: z.number().positive(),
  totalPages: z.number().nonnegative(),
});
export type CapaCaseListResponse = z.infer<typeof CapaCaseListResponseSchema>;

export const CapaCaseDetailResponseSchema = z.object({
  case: CapaCaseSchema,
  actions: z.array(CapaActionSchema),
});
export type CapaCaseDetailResponse = z.infer<typeof CapaCaseDetailResponseSchema>;

// ==========================================
// Phase 9: Statistical Process Monitoring (SPC) Schemas
// ==========================================

export const SpcStatusSchema = z.enum(['READY', 'INSUFFICIENT_DATA', 'DEGENERATE_BASELINE']);
export type SpcStatus = z.infer<typeof SpcStatusSchema>;

export const SpcSignalReasonSchema = z.enum(['ABOVE_UCL', 'BELOW_LCL']).nullable();
export type SpcSignalReason = z.infer<typeof SpcSignalReasonSchema>;

export const SpcPChartFilterSchema = z
  .object({
    productId: z.string().uuid(),
    productionLineId: z.string().uuid(),
    from: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Parameter "from" must be a valid date or ISO timestamp',
    }),
    to: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Parameter "to" must be a valid date or ISO timestamp',
    }),
    shiftId: z.string().uuid().optional(),
    inspectionStage: InspectionStageSchema.optional(),
  })
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return fromDate <= toDate;
    },
    {
      message: 'Parameter "from" must not be after parameter "to"',
      path: ['from'],
    },
  )
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 366; // Bounded to maximum 1 year
    },
    {
      message: 'Requested analysis window cannot exceed 366 days',
      path: ['to'],
    },
  );
export type SpcPChartFilter = z.infer<typeof SpcPChartFilterSchema>;

export const SpcBaselineSchema = z.object({
  subgroupCount: z.number().int().nonnegative(),
  minimumRequired: z.number().int().positive(),
  totalSampleSize: z.number().int().nonnegative(),
  totalFailedUnits: z.number().int().nonnegative(),
  pBar: z.number().nullable(),
});
export type SpcBaseline = z.infer<typeof SpcBaselineSchema>;

export const SpcSummarySchema = z.object({
  signalCount: z.number().int().nonnegative(),
  upperSignalCount: z.number().int().nonnegative(),
  lowerSignalCount: z.number().int().nonnegative(),
  interpretation: z.string(),
});
export type SpcSummary = z.infer<typeof SpcSummarySchema>;

export const SpcPChartPointSchema = z.object({
  inspectionId: z.string().uuid(),
  inspectionNumber: z.string(),
  batchId: z.string().uuid(),
  batchNumber: z.string().nullable().optional(),
  timestamp: z.string().datetime(),
  sampleSize: z.number().int().positive(),
  failedUnits: z.number().int().nonnegative(),
  observedProportion: z.number(),
  centerLine: z.number().nullable(),
  upperControlLimit: z.number().nullable(),
  lowerControlLimit: z.number().nullable(),
  signal: z.boolean(),
  signalReason: SpcSignalReasonSchema,
});
export type SpcPChartPoint = z.infer<typeof SpcPChartPointSchema>;

export const SpcPChartResponseSchema = z.object({
  status: SpcStatusSchema,
  filters: z.object({
    productId: z.string().uuid(),
    productCode: z.string().optional(),
    productName: z.string().optional(),
    productionLineId: z.string().uuid(),
    productionLineName: z.string().optional(),
    shiftId: z.string().uuid().nullable().optional(),
    shiftName: z.string().nullable().optional(),
    inspectionStage: InspectionStageSchema.nullable().optional(),
    from: z.string(),
    to: z.string(),
  }),
  baseline: SpcBaselineSchema,
  summary: SpcSummarySchema,
  points: z.array(SpcPChartPointSchema),
  warnings: z.array(z.string()),
});
export type SpcPChartResponse = z.infer<typeof SpcPChartResponseSchema>;

// ============================================================================
// Phase 10: Reports, Exports & Operational Alerts Contracts
// ============================================================================

export const ReportTypeSchema = z.enum([
  'production-performance',
  'inspection-summary',
  'defect-analysis',
  'capa-status',
  'spc-summary',
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const ExportFormatSchema = z.enum(['CSV', 'XLSX', 'PDF']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

const MAX_REPORT_WINDOW_DAYS = 366;

export const BaseReportFilterSchema = z
  .object({
    from: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Parameter "from" must be a valid ISO 8601 date string',
    }),
    to: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Parameter "to" must be a valid ISO 8601 date string',
    }),
  })
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      return fromDate.getTime() <= toDate.getTime();
    },
    {
      message: 'Parameter "from" must not be chronologically later than "to"',
      path: ['from'],
    },
  )
  .refine(
    (data) => {
      const fromDate = new Date(data.from);
      const toDate = new Date(data.to);
      const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= MAX_REPORT_WINDOW_DAYS;
    },
    {
      message: `Date range cannot exceed ${MAX_REPORT_WINDOW_DAYS} days`,
      path: ['to'],
    },
  );
export type BaseReportFilter = z.infer<typeof BaseReportFilterSchema>;

// 1. Production Performance Report
export const ProductionPerformanceFilterSchema = BaseReportFilterSchema.and(
  z.object({
    productId: z.string().uuid().optional(),
    productionLineId: z.string().uuid().optional(),
    status: BatchStatusSchema.optional(),
  }),
);
export type ProductionPerformanceFilter = z.infer<typeof ProductionPerformanceFilterSchema>;

export const ProductionPerformanceRowSchema = z.object({
  batchId: z.string().uuid(),
  batchNumber: z.string(),
  productCode: z.string(),
  productName: z.string(),
  productionLineCode: z.string(),
  productionLineName: z.string(),
  status: BatchStatusSchema,
  plannedQuantity: z.number().int(),
  producedQuantity: z.number().int(),
  acceptedQuantity: z.number().int(),
  scrapQuantity: z.number().int(),
  reworkPendingQuantity: z.number().int(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type ProductionPerformanceRow = z.infer<typeof ProductionPerformanceRowSchema>;

export const ProductionPerformanceReportSchema = z.object({
  reportType: z.literal('production-performance'),
  generatedAt: z.string().datetime(),
  filters: z.record(z.unknown()),
  summary: z.object({
    totalBatches: z.number().int().nonnegative(),
    batchesByStatus: z.record(z.number().int().nonnegative()),
    totalPlannedQuantity: z.number().int().nonnegative(),
    totalProducedQuantity: z.number().int().nonnegative(),
    totalAcceptedQuantity: z.number().int().nonnegative(),
    totalScrapQuantity: z.number().int().nonnegative(),
    totalReworkPendingQuantity: z.number().int().nonnegative(),
    overallScrapRate: z.number().nonnegative(),
    totalDowntimeEvents: z.number().int().nonnegative(),
    totalDowntimeDurationSeconds: z.number().int().nonnegative(),
  }),
  rows: z.array(ProductionPerformanceRowSchema),
});
export type ProductionPerformanceReport = z.infer<typeof ProductionPerformanceReportSchema>;

// 2. Quality Inspection Summary Report
export const InspectionSummaryFilterSchema = BaseReportFilterSchema.and(
  z.object({
    productId: z.string().uuid().optional(),
    productionLineId: z.string().uuid().optional(),
    stage: InspectionStageSchema.optional(),
    result: InspectionResultSchema.optional(),
  }),
);
export type InspectionSummaryFilter = z.infer<typeof InspectionSummaryFilterSchema>;

export const InspectionSummaryRowSchema = z.object({
  inspectionId: z.string().uuid(),
  inspectionNumber: z.string(),
  batchNumber: z.string(),
  productCode: z.string(),
  productionLineName: z.string(),
  inspectorName: z.string(),
  stage: InspectionStageSchema,
  status: InspectionStatusSchema,
  result: InspectionResultSchema.nullable(),
  sampleSize: z.number().int(),
  passedUnits: z.number().int(),
  failedUnits: z.number().int(),
  failureProportion: z.number().nullable(),
  inspectedAt: z.string().datetime(),
});
export type InspectionSummaryRow = z.infer<typeof InspectionSummaryRowSchema>;

export const InspectionSummaryReportSchema = z.object({
  reportType: z.literal('inspection-summary'),
  generatedAt: z.string().datetime(),
  filters: z.record(z.unknown()),
  summary: z.object({
    totalInspections: z.number().int().nonnegative(),
    completedInspections: z.number().int().nonnegative(),
    inProgressInspections: z.number().int().nonnegative(),
    cancelledInspections: z.number().int().nonnegative(),
    totalSampleUnits: z.number().int().nonnegative(),
    totalPassedUnits: z.number().int().nonnegative(),
    totalFailedUnits: z.number().int().nonnegative(),
    pooledFailureProportion: z.number().nullable(),
    stageBreakdown: z.record(z.number().int().nonnegative()),
    resultBreakdown: z.record(z.number().int().nonnegative()),
  }),
  rows: z.array(InspectionSummaryRowSchema),
});
export type InspectionSummaryReport = z.infer<typeof InspectionSummaryReportSchema>;

// 3. Defect Analysis Report
export const DefectAnalysisFilterSchema = BaseReportFilterSchema.and(
  z.object({
    productId: z.string().uuid().optional(),
    productionLineId: z.string().uuid().optional(),
    defectTypeId: z.string().uuid().optional(),
    severity: DefectSeveritySchema.optional(),
  }),
);
export type DefectAnalysisFilter = z.infer<typeof DefectAnalysisFilterSchema>;

export const DefectAnalysisRowSchema = z.object({
  defectRecordId: z.string().uuid(),
  inspectionNumber: z.string(),
  batchNumber: z.string(),
  defectTypeCode: z.string(),
  defectTypeName: z.string(),
  category: z.string(),
  severity: DefectSeveritySchema,
  occurrenceCount: z.number().int(),
  affectedUnitCount: z.number().int(),
  notes: z.string().nullable(),
  inspectedAt: z.string().datetime(),
});
export type DefectAnalysisRow = z.infer<typeof DefectAnalysisRowSchema>;

export const DefectAnalysisReportSchema = z.object({
  reportType: z.literal('defect-analysis'),
  generatedAt: z.string().datetime(),
  filters: z.record(z.unknown()),
  summary: z.object({
    totalFindings: z.number().int().nonnegative(),
    totalOccurrences: z.number().int().nonnegative(),
    totalAffectedUnits: z.number().int().nonnegative(),
    severityBreakdown: z.record(z.number().int().nonnegative()),
    categoryBreakdown: z.record(z.number().int().nonnegative()),
    topDefectsPareto: z.array(
      z.object({
        defectTypeCode: z.string(),
        defectTypeName: z.string(),
        severity: DefectSeveritySchema,
        occurrences: z.number().int().nonnegative(),
        affectedUnits: z.number().int().nonnegative(),
        cumulativePercentage: z.number().nonnegative(),
      }),
    ),
  }),
  rows: z.array(DefectAnalysisRowSchema),
});
export type DefectAnalysisReport = z.infer<typeof DefectAnalysisReportSchema>;

// 4. CAPA Status Report
export const CapaStatusFilterSchema = BaseReportFilterSchema.and(
  z.object({
    status: CapaStatusSchema.optional(),
    priority: CapaPrioritySchema.optional(),
    source: CapaSourceSchema.optional(),
  }),
);
export type CapaStatusFilter = z.infer<typeof CapaStatusFilterSchema>;

export const CapaStatusRowSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  title: z.string(),
  status: CapaStatusSchema,
  priority: CapaPrioritySchema,
  source: CapaSourceSchema,
  dueDate: z.string().nullable(),
  isOverdue: z.boolean(),
  totalActions: z.number().int(),
  completedActions: z.number().int(),
  verifiedBy: z.string().nullable(),
  verifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type CapaStatusRow = z.infer<typeof CapaStatusRowSchema>;

export const CapaStatusReportSchema = z.object({
  reportType: z.literal('capa-status'),
  generatedAt: z.string().datetime(),
  filters: z.record(z.unknown()),
  summary: z.object({
    totalCases: z.number().int().nonnegative(),
    statusBreakdown: z.record(z.number().int().nonnegative()),
    priorityBreakdown: z.record(z.number().int().nonnegative()),
    sourceBreakdown: z.record(z.number().int().nonnegative()),
    overdueCasesCount: z.number().int().nonnegative(),
    totalActions: z.number().int().nonnegative(),
    completedActions: z.number().int().nonnegative(),
    actionCompletionRate: z.number().nonnegative(),
    verifiedCasesCount: z.number().int().nonnegative(),
  }),
  rows: z.array(CapaStatusRowSchema),
});
export type CapaStatusReport = z.infer<typeof CapaStatusReportSchema>;

// 5. SPC Summary Report
export const SpcSummaryReportFilterSchema = BaseReportFilterSchema.and(
  z.object({
    productId: z.string().uuid(),
    productionLineId: z.string().uuid(),
    shiftId: z.string().uuid().optional(),
    inspectionStage: InspectionStageSchema.optional(),
  }),
);
export type SpcSummaryReportFilter = z.infer<typeof SpcSummaryReportFilterSchema>;

export const SpcSummaryReportSchema = z.object({
  reportType: z.literal('spc-summary'),
  generatedAt: z.string().datetime(),
  filters: z.record(z.unknown()),
  spcResponse: SpcPChartResponseSchema,
});
export type SpcSummaryReport = z.infer<typeof SpcSummaryReportSchema>;

// Scheduled Report Contracts
export const ScheduleCadenceSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type ScheduleCadence = z.infer<typeof ScheduleCadenceSchema>;

export const CreateScheduledReportSchema = z.object({
  name: z.string().min(1).max(150),
  reportType: ReportTypeSchema,
  filters: z.record(z.unknown()).default({}),
  format: ExportFormatSchema.default('PDF'),
  cadence: ScheduleCadenceSchema,
  timezone: z.string().min(1).max(50).default('UTC'),
  isEnabled: z.boolean().default(true),
});
export type CreateScheduledReport = z.infer<typeof CreateScheduledReportSchema>;

export const UpdateScheduledReportSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  filters: z.record(z.unknown()).optional(),
  format: ExportFormatSchema.optional(),
  cadence: ScheduleCadenceSchema.optional(),
  timezone: z.string().min(1).max(50).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateScheduledReport = z.infer<typeof UpdateScheduledReportSchema>;

export const ScheduledReportResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  reportType: ReportTypeSchema,
  filters: z.record(z.unknown()),
  format: ExportFormatSchema,
  cadence: ScheduleCadenceSchema,
  timezone: z.string(),
  isEnabled: z.boolean(),
  createdBy: z.string().uuid().nullable(),
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ScheduledReportResponse = z.infer<typeof ScheduledReportResponseSchema>;

export const ReportRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
export type ReportRunStatus = z.infer<typeof ReportRunStatusSchema>;

export const ReportRunResponseSchema = z.object({
  id: z.string().uuid(),
  scheduledReportId: z.string().uuid().nullable(),
  reportType: ReportTypeSchema,
  format: ExportFormatSchema,
  filters: z.record(z.unknown()),
  status: ReportRunStatusSchema,
  artifactId: z.string().uuid().nullable(),
  fileSizeBytes: z.number().int().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  triggeredBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type ReportRunResponse = z.infer<typeof ReportRunResponseSchema>;

// Operational Alert Contracts
export const AlertRuleTypeSchema = z.enum([
  'HIGH_INSPECTION_FAILURE_RATE',
  'OVERDUE_CAPA',
  'SPC_OUT_OF_CONTROL',
]);
export type AlertRuleType = z.infer<typeof AlertRuleTypeSchema>;

export const AlertSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const OperationalAlertSchema = z.object({
  id: z.string().uuid(),
  ruleType: AlertRuleTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  title: z.string(),
  message: z.string(),
  fingerprint: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  contextData: z.record(z.unknown()),
  acknowledgedBy: z.string().uuid().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().uuid().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNotes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OperationalAlert = z.infer<typeof OperationalAlertSchema>;

export const AlertListFilterSchema = z.object({
  status: AlertStatusSchema.optional(),
  ruleType: AlertRuleTypeSchema.optional(),
  severity: AlertSeveritySchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AlertListFilter = z.infer<typeof AlertListFilterSchema>;

export const ResolveAlertSchema = z.object({
  resolutionNotes: z.string().min(1).max(1000),
});
export type ResolveAlert = z.infer<typeof ResolveAlertSchema>;

export const AlertEvaluationResultSchema = z.object({
  evaluatedRules: z.number().int().nonnegative(),
  alertsGenerated: z.number().int().nonnegative(),
  alertsSkipped: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});
export type AlertEvaluationResult = z.infer<typeof AlertEvaluationResultSchema>;
