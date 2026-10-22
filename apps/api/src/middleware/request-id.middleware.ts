import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header('x-request-id');
  const requestId = existingId && existingId.trim().length > 0 ? existingId : randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
