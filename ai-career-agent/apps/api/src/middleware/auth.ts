import { Request, Response, NextFunction } from 'express';

// Extend express-session to include userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

/**
 * requireAuth — hard gate: returns 401 if there is no authenticated session.
 * Mount this on routes that require a logged-in user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session?.userId) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'You must be logged in to access this resource.',
    });
    return;
  }
  next();
}

/**
 * optionalAuth — soft gate: attaches userId to res.locals if a session exists,
 * then always calls next(). Use on public routes that can behave differently
 * for authenticated users.
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session?.userId) {
    res.locals.userId = req.session.userId;
  }
  next();
}
