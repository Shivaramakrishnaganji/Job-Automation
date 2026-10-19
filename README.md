# Job-Automation

An intelligent AI Career Agent system that discovers, tailors, tracks, and manages job applications and outreach across multiple career tracks (Software/IT, Core EEE, Business/Data Analyst).

## Architecture

This repository contains a modern TypeScript monorepo located in [`ai-career-agent/`](./ai-career-agent):

- **`apps/web`**: React + Vite + Tailwind CSS dashboard (Job Feed, Resume Studio, Application Tracker, Outreach, System Settings).
- **`apps/api`**: Node.js + Express + TypeScript backend powered by LangGraph.js and OpenAI (`gpt-6-luna`).
- **`packages/shared`**: Shared TypeScript types, schemas, and candidate profile definitions.
- **`prisma/`**: PostgreSQL database schema and migrations.

## Local Development

```bash
# 1. Navigate to the monorepo
cd ai-career-agent

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL and OPENAI_API_KEY

# 3. Install dependencies
npm install

# 4. Run database migrations
npm run migrate

# 5. Start dev servers (API on :4000, Web on :5173)
npm run dev
```

## Vercel Deployment

### Deploying the Web Frontend (`apps/web`):
1. Import this repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to:
   ```text
   ai-career-agent/apps/web
   ```
3. Configure Framework Preset as **Vite**.
4. In Environment Variables, set:
   - `VITE_API_BASE_URL`: URL of your deployed API server (e.g., `https://your-api.up.railway.app/api/v1`)
5. Deploy! Vercel SPA client-side routing is pre-configured via [`vercel.json`](./ai-career-agent/apps/web/vercel.json).
