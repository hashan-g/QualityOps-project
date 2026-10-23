import { z } from 'zod';

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
