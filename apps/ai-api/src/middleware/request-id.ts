import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.header('x-request-id') ?? crypto.randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
