import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { reportsService } from '../../modules/reports/reports.service.js';
import {
  ReportTypeSchema,
  ExportFormatSchema,
  CreateScheduledReportSchema,
  UpdateScheduledReportSchema,
  type ExportFormat,
} from '@qualityops/contracts';
import { BadRequestError } from '../../middleware/error.middleware.js';

export const reportsRouter = Router();

// All reporting endpoints require authentication
reportsRouter.use(authenticate);

/**
 * GET /api/v1/reports
 * Catalog of supported report types, filters, descriptions, and formats.
 */
reportsRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({
    reports: [
      {
        reportType: 'production-performance',
        title: 'Production Performance',
        description:
          'Batch lifecycle status, planned/produced/accepted/scrap quantities, scrap rate, and downtime duration.',
        supportedFormats: ['CSV', 'XLSX', 'PDF'],
        filters: ['from', 'to', 'productId', 'productionLineId', 'status'],
      },
      {
        reportType: 'inspection-summary',
        title: 'Quality Inspection Summary',
        description:
          'Completed inspection outcomes, sample sizes, passed/failed units, stage and result breakdowns.',
        supportedFormats: ['CSV', 'XLSX', 'PDF'],
        filters: ['from', 'to', 'productId', 'productionLineId', 'stage', 'result'],
      },
      {
        reportType: 'defect-analysis',
        title: 'Defect Analysis & Pareto Ranking',
        description:
          'Defect findings, distinct occurrence counts, affected unit counts, severity distribution, and Pareto ranking.',
        supportedFormats: ['CSV', 'XLSX', 'PDF'],
        filters: ['from', 'to', 'productId', 'productionLineId', 'defectTypeId', 'severity'],
      },
      {
        reportType: 'capa-status',
        title: 'CAPA Status & Action Tracker',
        description:
          'Corrective and Preventive Action cases by status, priority, overdue tracking, action completion, and verification.',
        supportedFormats: ['CSV', 'XLSX', 'PDF'],
        filters: ['from', 'to', 'status', 'priority', 'source'],
      },
      {
        reportType: 'spc-summary',
        title: 'Statistical Process Control (SPC) Summary',
        description:
          'Subgroup-level p-chart monitoring, Center Line p-bar, variable 3-sigma limits, and out-of-control signals.',
        supportedFormats: ['CSV', 'XLSX', 'PDF'],
        filters: ['from', 'to', 'productId', 'productionLineId', 'shiftId', 'inspectionStage'],
      },
    ],
  });
});

/**
 * GET /api/v1/reports/schedules
 * List scheduled reports (ADMIN, QUALITY_MANAGER).
 */
reportsRouter.get(
  '/schedules',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const schedules = await reportsService.listSchedules();
      res.status(200).json({ schedules });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/reports/schedules
 * Create a new scheduled report (ADMIN, QUALITY_MANAGER).
 */
reportsRouter.post(
  '/schedules',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = CreateScheduledReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(`Validation failed: ${parsed.error.message}`);
      }
      const schedule = await reportsService.createSchedule(parsed.data, req.user!.id);
      res.status(201).json({ schedule });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/reports/schedules/:id
 * Update or disable a scheduled report (ADMIN, QUALITY_MANAGER).
 */
reportsRouter.patch(
  '/schedules/:id',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = UpdateScheduledReportSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(`Validation failed: ${parsed.error.message}`);
      }
      const updated = await reportsService.updateSchedule(
        req.params.id as string,
        parsed.data,
        req.user!.id,
      );
      res.status(200).json({ schedule: updated });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/schedules/:id/runs
 * List execution history runs for a schedule (ADMIN, QUALITY_MANAGER).
 */
reportsRouter.get(
  '/schedules/:id/runs',
  requireRole(['ADMIN', 'QUALITY_MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const runs = await reportsService.listRunsForSchedule(req.params.id as string);
      res.status(200).json({ runs });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/artifacts/:artifactId
 * Download a generated report artifact by opaque artifactId (All roles).
 */
reportsRouter.get(
  '/artifacts/:artifactId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const format = (req.query.format as string)?.toUpperCase() ?? 'PDF';
      const parsedFormat = ExportFormatSchema.safeParse(format);
      if (!parsedFormat.success) {
        throw new BadRequestError('Query parameter "format" must be CSV, XLSX, or PDF');
      }

      const { stream, sizeBytes, filename } = reportsService.getArtifactDownload(
        req.params.artifactId as string,
        parsedFormat.data,
      );

      const contentTypes: Record<ExportFormat, string> = {
        CSV: 'text/csv; charset=utf-8',
        XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        PDF: 'application/pdf',
      };

      res.setHeader('Content-Type', contentTypes[parsedFormat.data]);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', sizeBytes);

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/:reportType/export
 * Download an on-demand report export as CSV, XLSX, or PDF (All roles).
 */
reportsRouter.get(
  '/:reportType/export',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedType = ReportTypeSchema.safeParse(req.params.reportType);
      if (!parsedType.success) {
        throw new BadRequestError(`Unsupported report type: ${req.params.reportType}`);
      }

      const format = ((req.query.format as string) || 'CSV').toUpperCase();
      const parsedFormat = ExportFormatSchema.safeParse(format);
      if (!parsedFormat.success) {
        throw new BadRequestError('Query parameter "format" must be CSV, XLSX, or PDF');
      }

      // Collect filters from query excluding format
      const { format: _, ...filters } = req.query;

      const { buffer, filename, contentType } = await reportsService.exportReport(
        parsedType.data,
        filters,
        parsedFormat.data,
      );

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.byteLength);

      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reports/:reportType
 * Returns JSON report data for interactive on-screen visualization (All roles).
 */
reportsRouter.get(
  '/:reportType',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedType = ReportTypeSchema.safeParse(req.params.reportType);
      if (!parsedType.success) {
        throw new BadRequestError(`Unsupported report type: ${req.params.reportType}`);
      }

      const report = await reportsService.getReportData(parsedType.data, req.query);
      res.status(200).json({ report });
    } catch (err) {
      next(err);
    }
  },
);
