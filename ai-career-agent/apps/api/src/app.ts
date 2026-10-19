import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { router } from './routes/index';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export function createApp(): Application {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — allow the web origin with credentials
  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    })
  );

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Session
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? 'fallback_dev_secret_change_me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/v1', router);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
