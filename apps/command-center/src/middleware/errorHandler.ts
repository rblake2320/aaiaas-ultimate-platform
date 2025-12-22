import type { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    error: 'internal_error',
    message: err instanceof Error ? err.message : 'Unknown error',
  });
}

