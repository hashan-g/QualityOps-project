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

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details?: unknown) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
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
  // Check for body-parser malformed JSON SyntaxError
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status: unknown }).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload in request body',
        requestId: req.id,
      },
    });
    return;
  }

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';

  // In production, mask 500+ messages or non-AppError messages to avoid leaking implementation details
  const isInternalServerError = statusCode >= 500;
  const isProduction = process.env.NODE_ENV === 'production' || config.NODE_ENV === 'production';
  const message =
    isProduction && (isInternalServerError || !(err instanceof AppError))
      ? 'An unexpected error occurred'
      : err.message || 'Internal server error';

  // Structured diagnostic logging for 500+ server errors
  if (isInternalServerError && config.NODE_ENV !== 'test') {
    const reqInfo = req.id ? `[Request: ${req.id}] ` : '';
    console.error(
      `[QualityOps API Error] ${reqInfo}${req.method} ${req.originalUrl} failed: ${err.message}`,
      err.stack ? `\n${err.stack}` : '',
    );
  }

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
