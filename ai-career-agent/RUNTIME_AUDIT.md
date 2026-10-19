# AI Career Agent: Runtime Verification & Integration Audit Report

**Date of Audit:** October 2026  
**Audited Location:** `C:\Users\shiva\Documents\Job Automation\ai-career-agent`  
**Target Profile:** B.Tech Electrical & Electronics Engineering (2023–2027), Fresher/Entry-Level  
**Target Tracks:** Software Engineering / IT, Core EEE, Business & Data Analyst  
**Audit Status:** **PASS (Production-Grade Architecture & Durable Runtime Verified)**  

---

## 1. Executive Summary

A comprehensive runtime verification, database integrity check, and integration test suite was conducted across both workspaces (`@career-agent/api` and `@career-agent/web`) and the shared library (`@career-agent/shared`).

- **Database Connectivity & Persistence:** PostgreSQL 18 is active on `localhost:5432/career_agent`. All 23 Prisma models and 15 enums are synchronized.
- **Durable LangGraph Checkpointing:** Replaced volatile in-memory storage with `@langchain/langgraph-checkpoint-postgres` (`PostgresSaver`), storing graph execution states, channel versions, and writes directly in PostgreSQL. Graph execution progress survives backend restarts.
- **Automated Tests:** **42 / 42 vitest tests PASSED** with 0 failures across 5 distinct test suites (unit, checkpoint persistence, and end-to-end API integration against live PostgreSQL).
- **Compilation & Type Safety:** Both TypeScript compilers (`tsc`) and Vite frontend bundler build cleanly with **0 errors**.
- **Model vs. Fallback Observability:** All document generation endpoints (tailored resumes, cover letters, outreach notes) explicitly tag their output with `generationSource: 'openai' | 'fallback_template'` and set transparent warnings when operating in fallback mode.
- **Evidence Grounding & Safe Action Policy:** AI-generated claims are strictly tied to verified `ProfileFact` IDs. Real external job submissions and live recruiter outreach remain strictly gated behind human approvals. No external mutating actions were performed during testing.

---

## 2. Automated Test Execution & Results

Testing was performed directly against the running PostgreSQL test database using `vitest run`.

```text
 RUN  v1.6.1 C:/Users/shiva/Documents/Job Automation/ai-career-agent/apps/api

 ✓ src/services/resources/row-validator.test.ts  (4 tests) 8ms
 ✓ src/services/matching/matcher.test.ts          (4 tests) 11ms
 ✓ src/adapters/jobs/adapters.test.ts            (2 tests) 16ms
 ✓ tests/checkpointer.test.ts                    (2 tests) 74ms
 ✓ tests/api.integration.test.ts                 (30 tests) 3634ms

 Test Files  5 passed (5)
      Tests  42 passed (42)
   Duration  8.52s
```

### Breakdown of Executed Test Suites

| Test Suite | Tests | Result | Coverage Area |
| :--- | :--- | :--- | :--- |
| **`tests/checkpointer.test.ts`** | 2 | **PASSED** | Durable PostgreSQL LangGraph checkpointing: compiles StateGraph with `PostgresSaver`, persists intermediate channel values into PostgreSQL tables, and successfully retrieves tuples across graph instances using `thread_id`. |
| **`tests/api.integration.test.ts`** | 30 | **PASSED** | End-to-end user registration, authentication cookies, profile upsert, profile facts management, search preferences, job creation, hard filter matching, resume tailoring, cover letter drafting, application status lifecycle, recruiter contact extraction, outreach generation, connector listing/toggling, dashboard metrics, system settings, and agent run launching/state persistence. |
| **`src/services/resources/row-validator.test.ts`** | 4 | **PASSED** | Column mapping, spreadsheet row validation, duplicate URL detection against database, and invalid data handling. |
| **`src/services/matching/matcher.test.ts`** | 4 | **PASSED** | Hard filtering for fresher eligibility (rejecting >1 year experience requirements when fresher-only is true) and keyword overlap scoring across candidate skill facts. |
| **`src/adapters/jobs/adapters.test.ts`** | 2 | **PASSED** | Greenhouse public board parsing, HTML stripping, canonical URL construction, and Lever board normalization using isolated mock payloads for CI independence. |

---

## 3. Architecture & Route Registration

### Backend (`apps/api`)
- **Framework:** Express + TypeScript (`CommonJS` target for Node runtime).
- **Session / Auth:** `express-session` with secure cookies (`httpOnly: true`, `sameSite: 'strict'`).
- **Database ORM:** Prisma Client 5.x singleton (`src/lib/prisma.ts`).
- **Durable Checkpointing:** `src/lib/checkpointer.ts` initializes `PostgresSaver` via `pg.Pool` (using `DATABASE_URL`), ensuring agent states persist across server restarts.
- **Audit Logging:** Every state-altering action logs an immutable event to the `AuditEvent` table (`src/lib/auditLogger.ts`).
- **Workflow Engine:** `@langchain/langgraph` state machine (`src/graphs/discovery.graph.ts`) backed by `PostgresSaver`.

#### Mounted API Routes
All routes are mounted under `/api/v1` and protected by `requireAuth` middleware (except `/auth/register` and `/auth/login`):

| Path | Methods | Handler Purpose |
| :--- | :--- | :--- |
| `/api/v1/auth` | `POST /register`, `POST /login`, `POST /logout`, `GET /me` | Session-based authentication & credential validation |
| `/api/v1/profile` | `GET /`, `PUT /`, `GET /facts`, `POST /facts`, `PATCH /facts/:id`, `DELETE /facts/:id`, `POST /import-resume` | Candidate profile details, structured facts with provenance, resume upload |
| `/api/v1/jobs` | `GET /`, `GET /:id`, `POST /import-url`, `POST /:id/match`, `POST /:id/hide`, `POST /:id/resume-draft`, `POST /:id/cover-letter-draft` | Job querying, filtering by score/track, manual URL import, on-demand matching, resume & cover letter drafting |
| `/api/v1/applications` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id/status`, `POST /:id/confirm-submission` | Application pipeline tracking, status transitions, user-confirmed submission with 7-day follow-up reminder |
| `/api/v1/resources` | `POST /upload`, `GET /`, `GET /:id`, `POST /:id/process`, `PATCH /:id/mapping`, `POST /:id/confirm-import`, `DELETE /:id` | Resource library file upload (XLSX, CSV, PDF), column mapping, row validation, batch import |
| `/api/v1/contacts` | `GET /`, `POST /`, `PATCH /:id`, `POST /:id/draft-outreach`, `POST /drafts/:id/approve`, `POST /drafts/:id/mark-sent` | Recruiter contact tracking and grounded connection note generation |
| `/api/v1/agent-runs` | `POST /`, `GET /`, `GET /:id`, `POST /:id/cancel` | Discovery graph execution, thread tracking, cancellation, and live stage polling |
| `/api/v1/connectors` | `GET /`, `PATCH /:key` | Connector registry listing with auth requirements, statuses, and activation toggles |
| `/api/v1/dashboard` | `GET /stats` | Real-time aggregated counts (applications, high-fit jobs, unverified facts) |
| `/api/v1/settings` | `GET /`, `PUT /` | Search preferences, fresher-only toggle, target roles, excluded companies |

### Frontend (`apps/web`)
- **Framework:** React 18 + Vite + Tailwind CSS + Lucide React.
- **State Management:** `@tanstack/react-query` for query caching and server-state sync.
- **API Client:** Axios instance with `baseURL: '/api/v1'` and `withCredentials: true`. Includes a 401 response interceptor.
- **Pages & Components:**
  - `Login.tsx`: Tabbed authentication (Sign In & Register).
  - `Dashboard.tsx`: High-level metrics, active agent runs, quick launch actions.
  - `JobFeed.tsx`: Score-ranked job postings, track filters, score range slider, link to job details.
  - `JobDetail.tsx`: Comprehensive posting view, score breakdown, evidence mapping, official career link.
  - `Profile.tsx`: Candidate bio, target track, verified profile facts manager.
  - `Applications.tsx`: Pipeline tracking across application stages.
  - `ResumeStudio.tsx`: Tailored resume inspection with evidence fact links and generation source indicator.
  - `Outreach.tsx`: Recruiter contact list, grounded outreach note preview with character count checks.
  - `ResourceLibrary.tsx`: File upload, spreadsheet import wizard, validation preview.
  - `Settings.tsx`: Target tracks, preferences, connector controls.
  - `AgentRunnerModal.tsx`: Live-polling modal tracking agent run discovery stages and counters.

---

## 4. Source Registry & Connector Status

The agent maintains a registry of job and recruiter sources. Direct unauthorized scraping of platforms requiring candidate logins is strictly disallowed in favor of assisted workflows:

| Connector Key | Display Name | Access Mode | Auth Requirement | Status | Allowed Actions | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `greenhouse` | Greenhouse Public Boards | `public_api` | None (Public JSON) | **Active** | `discover`, `fetch_details` | Ingests from official `boards-api.greenhouse.io` public company boards. |
| `lever` | Lever Public Postings | `public_api` | None (Public JSON) | **Active** | `discover`, `fetch_details` | Ingests from official `api.lever.co/v0/postings` public company endpoints. |
| `ashby` | Ashby Public Postings | `public_api` | None (Public API) | **Active** | `discover` | Ingests public job listings for high-growth tech firms. |
| `user_resources` | Resource Library Ingestion | `user_supplied` | User Upload | **Active** | `discover`, `fetch_details` | Parses user spreadsheets (XLSX, CSV), campus circulars, and target lists. |
| `linkedin_assist` | LinkedIn Assisted Outreach | `manual_assisted` | User Browser Session | **Planned** | `draft_outreach` | Drafts personalized, grounded connection notes for manual sending. Headless scraping is disabled. |
| `unstop_campus` | Unstop Campus Challenges | `public_search` | None / User Session | **Planned** | `discover` | Early-career hackathons and campus hiring for Indian engineering students. |

---

## 5. Model vs. Fallback Observability & Live OpenAI Smoke Test

### Generation Source Tracking
To ensure complete transparency regarding whether an artifact was produced by an LLM or by deterministic fallback templates, all document generation endpoints record:

- **Tailored Resumes:** `document.contentJson.generationSource = 'openai' | 'fallback_template'`.
- **Cover Letters:** `document.contentJson.generationSource = 'openai' | 'fallback_template'`.
- **Outreach Drafts:** `draft.draftType = 'Connection Note (OpenAI)' | 'Connection Note (Template Fallback)'`.

When in fallback mode, explicit warning notices are placed in the document payload (e.g. `'Draft created using offline template. Add live OpenAI key for deep contextual tailoring.'`).

### Executing a Low-Cost Live OpenAI Smoke Test
When testing with a live OpenAI key:

1. Add your key to `.env`:
   ```dotenv
   OPENAI_API_KEY=sk-proj-...
   OPENAI_MODEL=gpt-4o-mini
   ```
2. Trigger a single resume tailoring or match scoring call via the API or Web UI:
   ```powershell
   # Resume draft smoke test (cost < $0.002)
   curl -X POST http://localhost:4000/api/v1/jobs/{jobId}/resume-draft -H "Cookie: connect.sid=..."
   ```
3. Verify in PostgreSQL that an `AiUsageEvent` row was recorded with positive token counts:
   ```sql
   SELECT model, operation, "inputTokens", "outputTokens", "estimatedCost" 
   FROM "AiUsageEvent" ORDER BY "createdAt" DESC LIMIT 1;
   ```
4. Verify that `document.contentJson.generationSource` equals `'openai'`.

---

## 6. Verification of Grounding, Provenance & Safety

1. **Candidate Evidence Grounding:**
   - Every bullet in generated resumes and cover letters requires explicit references to verified `ProfileFact` IDs (`evidenceFactIds`).
   - If an unverified fact or missing metric is encountered, the generator logs a warning and does not fabricate numbers or employment history.
2. **Job Link Provenance:**
   - Every discovered job persists its canonical source URL, connector identity, and timestamped observation record in `JobSourceObservation`.
   - The UI displays an external link badge directing candidates to the official company careers page.
3. **Safe Interruption & Idempotency:**
   - Re-running the discovery graph on previously seen jobs updates existing records via `prisma.jobMatch.upsert` without generating duplicate entries or triggering unique constraint exceptions.
   - Resource imports compute a SHA-256 hash of the uploaded file; re-uploading the same file returns the existing resource record.
4. **Human-in-the-Loop Submission Gate:**
   - The application status flow strictly follows: `DISCOVERED` → `READY_FOR_REVIEW` → `APPLICATION_OPENED` → `APPLIED`.
   - An application is **only** marked `APPLIED` when the candidate explicitly submits proof/confirmation via `POST /api/v1/applications/:id/confirm-submission`.

---

## 7. Operational Guide & Exact Startup Commands

### Prerequisites
- Node.js v18+ or v20+
- PostgreSQL 14+ running locally on port 5432

### Database Setup Instructions

1. Start PostgreSQL (e.g., Windows service `postgresql-x64-18`):
   ```powershell
   Get-Service -Name postgresql* | Start-Service
   ```

2. Ensure the database `career_agent` exists:
   ```powershell
   psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE career_agent;"
   ```

3. Synchronize database schema and generate Prisma client:
   ```powershell
   cd "C:\Users\shiva\Documents\Job Automation\ai-career-agent"
   npx prisma db push
   npx prisma generate
   ```

> [!NOTE]
> For production environments, generate migration files with `npx prisma migrate dev --name <migration_name>` and apply them with `npx prisma migrate deploy`. `prisma db push` is designated for local rapid prototyping.

### Running the Application

#### Development Mode (Concurrent API + Web)
From the root directory:
```powershell
npm run dev
```
- API will start on: `http://localhost:4000`
- Web UI will start on: `http://localhost:5173`

#### Running Workspaces Separately
- **Backend Only:**
  ```powershell
  npm run --prefix apps/api dev
  ```
- **Frontend Only:**
  ```powershell
  npm run --prefix apps/web dev
  ```

#### Running Automated Tests
- **Run all 5 test suites (42 tests):**
  ```powershell
  npm run --prefix apps/api test
  ```

#### Building for Production
- **Build all packages and workspaces:**
  ```powershell
  npm run build
  ```

---

## 8. Required Environment Variables

Create a `.env` file in the root directory (based on `.env.example`):

```dotenv
# Node & Server
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
SESSION_SECRET=replace_with_a_secure_random_string_min_32_chars

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://postgres:[PASSWORD]@localhost:5432/career_agent
LANGGRAPH_CHECKPOINT_DATABASE_URL=postgresql://postgres:[PASSWORD]@localhost:5432/career_agent

# Storage
PRIVATE_FILES_DIR=./private-files

# AI Provider Configuration (OpenAI)
# If left blank or invalid, the system runs in deterministic fallback mode
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
OPENAI_MODEL_FAST=gpt-4o-mini
OPENAI_MODEL_QUALITY=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# AI Cost & Rate Safety Caps
AI_DAILY_BUDGET_USD=0.50
AI_MONTHLY_BUDGET_USD=10.00
AI_RUN_BUDGET_USD=0.25
AI_MAX_CALLS_PER_RUN=100

# Background Worker & Cache (Optional / Future Phase)
REDIS_URL=redis://localhost:6379
```

> [!CAUTION]
> Never commit `.env` or production credentials to version control. The `.gitignore` file is configured to exclude all `.env` files and `private-files/` directories.

---

## 9. Prioritized List of Remaining Implementation Work

1. **Redis & BullMQ Durable Worker Queue (Phase 7):**
   - Decouple background LangGraph executions from Express request-response threads using BullMQ queues with Redis for durable task scheduling.
2. **Assisted Browser Application Filling (Phase 8):**
   - Build a browser extension or Playwright-assisted workflow that opens official career pages, pre-populates verified candidate facts into application form fields, and requires the user to review and click submit.
3. **LinkedIn OAuth & Archive Ingestion (Phase 8):**
   - Provide candidate archive import (`Profile.zip`) to extract verified work experience and skills directly into `ProfileFact` records without web scraping.
4. **Vector Search & RAG for Prep (Phase 9):**
   - Enable pgvector in PostgreSQL to chunk and embed campus syllabus documents, company-specific interview archives, and technical cheat sheets.
