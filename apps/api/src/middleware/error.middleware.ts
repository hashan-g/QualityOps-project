import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string | undefined;
    details?: unknown;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      requestId: req.id,
    },
  };
  res.status(404).json(response);
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';

  // In production, mask non-AppError messages to avoid leaking implementation details
  const message =
    config.NODE_ENV === 'production' && !(err instanceof AppError)
      ? 'An unexpected error occurred'
      : err.message || 'Internal server error';

  const response: ApiErrorResponse = {
    error: {
      code,
      message,
      requestId: req.id,
      ...(err instanceof AppError && err.details ? { details: err.details } : {}),
    },
  };

  res.status(statusCode).json(response);
}
