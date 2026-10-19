import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

/**
 * Global Express error handler. Must be registered as the LAST middleware
 * (after all routes) via `app.use(errorHandler)`.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? err.status ? parseInt(String(err.status ?? 500), 10) : 500;
  const isServerError = statusCode >= 500;

  // Always log server errors; log client errors only in development
  if (isServerError || process.env.NODE_ENV !== 'production') {
    console.error(`[errorHandler] ${req.method} ${req.path} — ${statusCode}`, err);
  }

  res.status(statusCode).json({
    error: {
      message: isServerError && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message ?? 'An unexpected error occurred',
      ...(process.env.NODE_ENV !== 'production' && isServerError
        ? { stack: err.stack }
        : {}),
    },
  });
}
