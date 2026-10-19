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

  const isProd = process.env.NODE_ENV === 'production';

  // Trust reverse proxy in production so secure HTTPS cookies work behind Render
  if (isProd) {
    app.set('trust proxy', 1);
  }

  // Security headers
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS — allow web origins with credentials
  const configuredOrigin = process.env.WEB_ORIGIN;
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests without origin (cURL, health checks, server-to-server)
        if (!origin) return callback(null, true);
        // Allow configured origin, localhost, or any vercel.app deployment
        if (
          !configuredOrigin ||
          configuredOrigin === '*' ||
          origin === configuredOrigin ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
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
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
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
