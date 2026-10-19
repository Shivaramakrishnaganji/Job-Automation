# AI Career Agent

An intelligent job search assistant that automates discovery, tracking, and outreach across multiple career tracks.

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis (optional, for rate limiting)

## Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd ai-career-agent

# 2. Copy env template and fill in your values
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY, OPENAI_MODEL

# 3. Install all workspace dependencies
npm install

# 4. Run database migrations
npm run migrate

# 5. Start development servers (API on :4000, Web on :5173)
npm run dev
```

## Project Structure

```
ai-career-agent/
├── apps/
│   ├── api/          # Express + TypeScript backend
│   └── web/          # React + Vite + Tailwind frontend
├── packages/
│   └── shared/       # Shared TypeScript types and Zod schemas
├── prisma/
│   └── schema.prisma # Database schema
└── private-files/    # Gitignored file storage for uploads
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API and Web in parallel (watch mode) |
| `npm run build` | Build all packages and apps |
| `npm run migrate` | Run Prisma migrations (dev) |
| `npm run migrate:deploy` | Run Prisma migrations (production) |
| `npm run lint` | Run ESLint across all workspaces |

## Apps

### API (`apps/api`) — port 4000
Express REST API with session-based auth, file upload, and LangGraph agent integration.

### Web (`apps/web`) — port 5173
React SPA with React Router, TanStack Query, and Tailwind CSS.
