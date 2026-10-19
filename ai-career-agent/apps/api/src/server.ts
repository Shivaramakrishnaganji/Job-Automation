import dotenv from 'dotenv';
dotenv.config();

// Validate required environment variables before starting
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[server] Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env and fill in the values.`
  );
  process.exit(1);
}

import { createApp } from './app';
import { errorHandler } from './middleware/errorHandler';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const app = createApp();

// Global error handler must be registered after all routes
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] API running at http://localhost:${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/health`);
  console.log(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
});
