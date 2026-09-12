import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof ZodError || err.name === 'ZodError') {
    const issues = err.errors || err.issues || [];
    const issueMessages = issues.map((e: any) => e.message).join(', ');
    res.status(400).json({
      error: 'Validation failed',
      details: issueMessages,
      issues: issues.map((e: any) => ({ field: (e.path || []).join('.'), message: e.message })),
    });
    return;
  }

  console.error('Unhandled server error:', err.message || err);

  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message || 'An unexpected error occurred';

  res.status(status).json({ error: message });
};
