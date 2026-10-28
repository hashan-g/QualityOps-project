import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

// Strictly allow only alphanumeric characters, dashes, and underscores up to 64 characters
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header('x-request-id');
  const requestId =
    existingId && VALID_REQUEST_ID_REGEX.test(existingId.trim()) ? existingId.trim() : randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
