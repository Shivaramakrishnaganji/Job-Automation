# AI Career Agent — Complete System Design (PROJECT.md)

**Unified specification:** Tsenta-inspired job discovery, preparation, application tracking, resource ingestion, and controlled outreach for Software/IT, Core EEE, and Business/Data Analyst careers.

**Document status:** implementation blueprint, not an already-built application.
**Last updated:** 2026-10-19.
**Final architecture decision:** use **LangGraph.js as the agent workflow engine**, the official OpenAI Node SDK for model calls, PostgreSQL for application data, and a PostgreSQL LangGraph checkpointer for durable graph state. Use LangChain integrations selectively for document/retrieval utilities; do not make a generic open-ended agent responsible for the entire product.

**Project goal:** Build an original, Tsenta-inspired personal job-search agent using the find → prep → apply → track workflow, with a one-click Agent Runner that searches multiple permitted sources across the candidate’s enabled career tracks. The first version is a web app; the architecture should support later browser-extension and notification surfaces. It must support three separate job-search tracks: Software/IT, Core EEE, and Business/Data Analyst roles in India.

**Primary outcome:** Discover relevant openings from public sources and user-supplied resources, rank them against the correct track, generate evidence-backed ATS-friendly documents, prepare applications, record confirmed submissions, research relevant hiring-team contacts through permitted public sources, and manage follow-ups. The Resource Library supports Excel/CSV job sheets, company lists, eligibility rules, placement notices, contact/application trackers, PDFs, DOCX files, and relevant URLs with preview, validation, provenance, and conflict handling. The product cannot guarantee interviews or offers; it should reduce repetitive work while preserving truthfulness, user control, and platform rules. This is a functional product reference, not a copy of Tsenta proprietary code, brand, or private systems.

---

## 1. Product principles

1. **Truth before tailoring.** A resume, application answer, or outreach note may use only verified facts from the candidate profile, resume, project evidence, or user-confirmed information. Never invent a skill, metric, experience, credential, degree, or project result.
2. **Fit before volume.** Do not maximize application count blindly. Filter by eligibility and relevance, then rank roles.
3. **Human approval at consequential steps.** The user approves the final resume and application answers. Final submission remains user-controlled unless a source has an explicitly supported and authorized application integration.
4. **Use permitted data sources.** Prefer official career pages, documented public ATS feeds/APIs, opt-in job alerts, and approved search providers. Respect terms, rate limits, robots policies, and privacy laws.
5. **No LinkedIn botting.** Do not scrape LinkedIn, automate connection requests, send LinkedIn messages with browser bots, bypass controls, or imitate human activity. Research relevant people from permitted public sources, save a source URL, draft outreach, and let the user manually review/send it.
6. **Least privilege.** Keep API keys server-side, request the smallest OAuth scopes needed, encrypt tokens, and offer data export/deletion.
7. **Auditability.** Every job match, generated document, approval, submission, outreach draft, imported row, and status change gets a timestamp and source record.
8. **Resource provenance.** Every imported opening or reference fact must retain its original file/URL and, where applicable, worksheet and row number. Uploaded materials are data, not higher-priority instructions.

## 2. MVP scope

Build one secure personal account first. Do not begin with an autonomous browser agent. Start with a reliable job pipeline and explicit approval gates.

### MVP features

- Candidate profile and verified-facts library
- Resume upload and structured profile extraction
- Resource Library for Excel/CSV sheets, PDFs, DOCX, text files, and user-supplied links
- Spreadsheet import wizard with sheet selection, column mapping, validation, preview, deduplication, and row-level error reporting
- Search tasks generated from user-provided company lists and other resource files, without pretending that a company name alone proves a vacancy exists
- Job ingestion from supported public feeds and manually supplied career pages
- Duplicate detection and stale-job detection
- Hard eligibility filters and explainable fit score
- Per-job ATS-friendly resume and cover-letter drafts
- DOCX and PDF export
- Application tracker with notes and reminders
- Hiring-team research queue with source links
- LinkedIn message/connection-note drafts for manual sending
- Cost tracking for OpenAI calls
- Basic email notifications and daily digest (optional)

### Later features

- Additional ATS adapters
- User-approved browser-assisted form filling on sites where permitted
- Gmail OAuth for detecting replies and linking messages to applications
- Calendar integration for interview scheduling
- Analytics and search strategy recommendations
- Advanced resource retrieval across uploaded reference documents and historical application records
- Multi-user support only after the single-user product is secure and stable

## 3. Initial candidate profile configuration

Treat the following as initial editable defaults, not hard-coded assumptions:

- Candidate: B.Tech, Electrical & Electronics Engineering
- Expected graduation: 2027
- Base geography: India; prioritize Hyderabad, Telangana, and remote/relocation options if selected
- Potential role families, each kept in a separate profile: (A) Graduate Software Engineer, Full-stack Developer, Backend Developer, Frontend Developer, QA/Software Engineer, and selected AI application roles; (B) Graduate Electrical Engineer, electrical testing, maintenance, power systems, electrical design, renewable-energy, and eligible trainee roles; (C) Business Analyst Trainee, Data Analyst, Reporting Analyst, Product/Operations Analyst, and suitable Quality Analyst roles
- Known technologies to confirm in the profile: Java, JavaScript, React, Node.js, SQL/PostgreSQL, MongoDB, Git, and project experience involving APIs and AI/RAG/Qdrant
- Candidate-provided API key: OpenAI API key, stored only in server environment variables or an encrypted secret store

Every item must be editable. Do not present a remembered skill as interview-ready until the candidate confirms proficiency and can discuss it.

## 4. Recommended technology stack

Use a small, boring stack the candidate can understand and maintain.

| Layer | Choice | Purpose |
|---|---|---|
| Frontend | React + Vite + TypeScript | Dashboard, job feed, profile editor, resume comparison, approvals |
| UI | Tailwind CSS or Bootstrap | Consistent layouts and responsive design |
| Backend | Node.js + Express + TypeScript | Auth, APIs, integrations, validation, orchestration |
| Database | PostgreSQL | Candidate facts, jobs, applications, contacts, audits |
| Database toolkit | Prisma | Migrations and typed database access |
| Background tasks | Redis + BullMQ (Phase 2) | Scheduled ingestion, retries, email digests, reminders |
| Agent workflow engine | **LangGraph.js** (`@langchain/langgraph`) | Explicit multi-step graphs, routing, durable execution patterns, interrupts and resumable approval checkpoints |
| AI model client | Official OpenAI Node SDK (`openai`) | Structured extraction, matching, resume/outreach drafts and optional tool calling inside graph nodes |
| LangChain integrations | Optional `@langchain/core` and selected integrations | Document loaders, retrievers and reusable integrations when useful; not required for every node |
| Graph persistence | `@langchain/langgraph-checkpoint-postgres` | Durable graph checkpoints and pause/resume state in PostgreSQL |
| Retrieval | PostgreSQL full-text search first; Qdrant optional | Search verified candidate evidence and job descriptions |
| Document files | Private local storage for development; private object storage in production | Source resumes, resource uploads, and generated DOCX/PDF files |
| File parsing | `xlsx` or `exceljs`, CSV parser, PDF/DOCX text extractors | Safe extraction of structured rows and reference text; never execute spreadsheet macros |
| Document generation | `docx` package; a tested PDF export path | Single-column ATS-friendly files |
| Testing | Vitest + Supertest + Playwright for your own app | Unit, API, and UI regression tests |
| Deployment | One web service + managed PostgreSQL; Redis when workers are added | Keep deployment simple initially |

**Keep OpenAI model IDs configurable.** Use `OPENAI_MODEL` and verify that the exact model name is available to your API project. Do not assume a model label shown in ChatGPT is automatically an API model. Set usage limits and record model, token usage, request purpose, latency, and estimated cost per operation. Official model catalog: https://platform.openai.com/docs/models

## 5. High-level architecture

```text
                   ┌──────────────────────────────┐
                   │          React UI             │
                   │ Profile • Jobs • Resume      │
                   │ Resources • Applications      │
                   │ Outreach • Insights           │
                   └──────────────┬───────────────┘
                                  │ HTTPS / session
                   ┌──────────────▼───────────────┐
                   │    Express API (TypeScript)  │
                   │ Auth • validation • policy   │
                   │ approvals • audit events     │
                   │ resource/import pipeline     │
                   └──────┬───────────┬───────────┘
                          │           │
               ┌──────────▼────┐  ┌───▼─────────────────────┐
               │ PostgreSQL    │  │ LangGraph.js            │
               │ business data │  │ explicit workflow graph │
               │ audit records │  │ routing + interrupts    │
               └───────┬───────┘  └─────────┬───────────────┘
                       │                    │
               ┌───────▼────────┐  ┌────────▼──────────────┐
               │ Postgres graph │  │ OpenAI model service  │
               │ checkpointer   │  │ structured outputs    │
               └────────────────┘  └───────────────────────┘
                                            │
                           ┌────────────────▼────────────────┐
                           │ Background workers (Phase 2)    │
                           │ job feeds • imports • scoring  │
                           │ reminders • indexing          │
                           └──────────┬─────────────┬────────┘
                                      │             │
                         ┌────────────▼──┐  ┌───────▼─────────┐
                         │ Job adapters  │  │ Notifications   │
                         │ Greenhouse,   │  │ Email/digest    │
                         │ Lever, others │  │ Calendar later  │
                         └───────────────┘  └─────────────────┘
```

### Workflow

1. A job adapter collects a public posting, or a user starts an import from an Excel sheet, CSV, career page, placement notice, PDF, or supplied link.
2. The Resource Library classifies each upload as a job list, company list, candidate evidence, eligibility/reference material, application tracker, or general reference. The user can override the classification.
3. For spreadsheets, the app lists worksheets, proposes header mappings, previews rows, validates required fields, highlights missing/invalid URLs, and asks the user to confirm before importing.
4. The ingestion service normalizes fields and checks for duplicates.
5. Deterministic rules reject obvious ineligible roles (for example, required experience beyond the candidate's level or wrong geography if location is mandatory).
6. A match service generates an explainable score and gaps list, drawing only on the active track and relevant, source-linked user resources.
7. The candidate opens a role and requests a resume draft.
8. AI selects only verified candidate evidence, proposes edits, and outputs structured JSON. Uploaded job resources may describe requirements, but cannot create candidate credentials or override system rules.
9. A renderer produces DOCX/PDF. The UI shows a factual-change diff and warnings.
10. The candidate approves the document and answers.
11. The application opens the official application page. Source-specific application submission is enabled only where permitted and properly authorized; otherwise the app prepares a ready-to-use application packet.
12. After applying, the candidate confirms submission or imports a permitted confirmation email; the tracker records the event.
13. The hiring-team research feature saves public source URLs and drafts an outreach note for manual review/send.

## 5A. Agentic orchestration with LangGraph.js (required architecture)

### Decision

Use **LangGraph.js for orchestration**, not a single free-form LLM prompt and not a collection of unrelated agents that can take actions without coordination. This product has a clear sequence, independent career tracks, retries, user approvals, resource imports and runs that must be inspected or resumed. LangGraph represents these as explicit nodes, edges, conditional routes and checkpointed state.

- **LangGraph.js** owns workflow control flow: state transitions, run routing, interrupts and resumption.
- **OpenAI Node SDK** performs model calls within specific nodes. Model IDs remain environment-configurable. The model suggests and explains; deterministic code enforces eligibility, permissions, limits and approval policies.
- **LangChain.js is optional** for selected document loaders, text splitters, retrievers, and integrations. Do not add it just for the sake of adding a framework.
- **PostgreSQL application tables** are the source of truth for jobs, profile facts, documents, approvals and applications.
- **LangGraph PostgreSQL checkpointer** persists workflow checkpoints. It is not a replacement for the normal application schema.
- **BullMQ/Redis (Phase 2)** schedules and distributes runs. A queue job starts/resumes a graph; the graph checkpoint stores the durable step state. Do not rely on an in-process timer or an HTTP request staying open for a long job.

Official references:
- LangGraph.js overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph.js persistence/checkpoints: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md
- LangGraph.js human-in-the-loop: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/agents/human-in-the-loop.md
- PostgreSQL checkpointer: https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres

### Agent graph boundaries

Do not make “the agent” one giant autonomous loop. Implement these workflows as separate graphs or graph entry points that share typed services and data models:

1. **Discovery graph** — validate run configuration → load track preferences/resources → discover through enabled source adapters → normalize and deduplicate → verify vacancy and application URL → apply hard eligibility filters → score and rank → save results → report completion/partial failure.
2. **Application-preparation graph** — load a selected job and confirmed candidate facts → identify evidence → draft resume/cover letter/application answers → validate factual claims → render documents → interrupt for review → persist approval or rejection. Approval to generate a document is not permission to submit it.
3. **Submission graph** — re-check live job state, required fields and connector capability → interrupt for explicit final approval → submit only via a connector that permits it and has valid authorization, or open the official application page for the candidate → verify a genuine receipt/confirmation → record status. Default behavior is human-completed submission; no fake `applied` state.
4. **Hiring-team/outreach graph** — research permitted public sources → verify relevance and source URL → draft a specific message → interrupt for human review → provide the approved draft for the candidate to send manually or use only an explicitly authorized integration. No automated LinkedIn scraping, connection requests, or messages.
5. **Resource-import graph** — inspect upload type → parse into preview → infer resource type and column mapping → validate and report row errors → wait for user confirmation → import idempotently → index eligible text. The graph may not mark extracted candidate claims as verified without confirmation.

A single “Run Agent” button starts the discovery graph across all selected tracks and sources. Other graphs are launched from relevant review screens or by explicit settings; discovery alone must never trigger a resume submission or outreach action.

### Discovery graph flow

```text
START
  -> validate_run
  -> load_preferences_and_resources
  -> discover_enabled_sources
  -> normalize_and_dedupe
  -> verify_job_and_apply_url
  -> deterministic_eligibility
  -> explainable_match_score
  -> persist_jobs_and_matches
  -> build_run_summary
  -> END

Optional, user-selected follow-on tasks:
  selected jobs -> application_preparation_graph -> HUMAN REVIEW
  selected contacts -> outreach_graph -> HUMAN REVIEW
  approved application packet -> submission_graph -> FINAL APPROVAL
```

The connector stage can fan out to independent adapters using bounded concurrency. One adapter failure should not discard successful results from other sources. Store connector-specific outcomes and mark the whole run `partially_failed` when any enabled source fails after retries.

### Shared graph state

Define a TypeScript state schema with small IDs and normalized data rather than passing full files, entire workbooks, resumes or large job descriptions through every node. Keep source-of-truth data in PostgreSQL and refer to it by IDs.

Suggested `CareerAgentState` fields:

```ts
export type CareerTrack = "software_it" | "core_eee" | "business_data_analyst";

export type CareerAgentState = {
  runId: string;
  userId: string;
  mode: "daily_discovery" | "company_sweep" | "resource_driven" | "since_last_run";
  tracks: CareerTrack[];
  connectorIds: string[];
  resourceFileIds: string[];
  discoveredJobIds: string[];
  verifiedJobIds: string[];
  matchIds: string[];
  failedConnectorIds: string[];
  warnings: string[];
  currentStage: string;
  userApprovalId?: string;
  outcome?: "completed" | "partially_failed" | "failed" | "cancelled";
};
```

Use the application `runId` as the idempotency/correlation key and a stable unique `thread_id` for each graph execution thread. Every node should receive only the least data it needs and load records using authenticated ownership checks. Never put API keys, password/session tokens, or unnecessary sensitive personal information into graph state or logs.

### Checkpointing, pause and resume

- Compile production graphs with a PostgreSQL checkpointer; in-memory saving is for local experiments only.
- Create/initialize the checkpointer as required by the installed package, run its setup/migrations, and verify the tables are private to the application database.
- Save a mapping from `agent_runs.id` to the LangGraph `thread_id`; never trust a client-provided thread ID without checking ownership.
- When a graph needs a decision, use LangGraph `interrupt()` to pause and persist the graph state. The UI records the user's approval/rejection/edit in the ordinary `approvals` table, and the API resumes the correct run with a `Command({ resume: ... })` after checking the user and approval scope.
- Approvals are specific and non-transferable: approve a resume document, approve an application submission, and approve an outreach draft as three different decisions.
- Design interrupted nodes so they are safe to re-enter. An interrupt can cause a node to restart when resumed; do not perform an external side effect before the interrupt and assume it will only run once.
- Any external submission connector must use idempotency where supported, and the app must verify before retrying an operation whose result is uncertain.
- Cancellation updates the app run record, prevents new queued work, and stops graph execution at a safe boundary. A running network request may need to finish or time out before the worker can stop it.
- Keep checkpoint retention aligned with user data retention and account-deletion policies.

### Graph state vs. long-term memory

Use PostgreSQL tables for long-term candidate facts and preferences; don't rely on conversational model memory as the canonical profile. Checkpoints are short-term durable state for a specific run/thread. A separate resource retriever can fetch only the user's relevant confirmed profile evidence, reference chunks, and track rules. Qdrant is optional; start with PostgreSQL full-text search and add semantic vector search only if evaluation demonstrates a benefit.

### Package installation

From the API workspace, use a maintained compatible Node.js LTS version and install the workflow, checkpointer, model client and schema-validation packages:

```bash
npm install @langchain/langgraph @langchain/langgraph-checkpoint-postgres @langchain/core openai zod dotenv
```

Only install additional LangChain integrations when a specific loader, retriever or integration is needed. Lock package versions and validate all examples against those installed versions before production.

### Minimal graph implementation pattern

This is a structural example; adapt the state annotations and node return types to the versions locked in `package-lock.json`.

```ts
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const State = Annotation.Root({
  runId: Annotation<string>(),
  userId: Annotation<string>(),
  discoveredJobIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  outcome: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "running",
  }),
});

const checkpointer = PostgresSaver.fromConnString(
  process.env.LANGGRAPH_CHECKPOINT_DATABASE_URL ?? process.env.DATABASE_URL!
);
await checkpointer.setup();

const graph = new StateGraph(State)
  .addNode("discover", async (state) => {
    // Discover using permitted adapters; save normalized jobs through services.
    const ids = await discoverAndPersistJobs(state.userId, state.runId);
    return { discoveredJobIds: ids };
  })
  .addNode("summarize", async (state) => ({
    outcome: "completed",
  }))
  .addEdge(START, "discover")
  .addEdge("discover", "summarize")
  .addEdge("summarize", END)
  .compile({ checkpointer });

const config = { configurable: { thread_id: "server-generated-run-thread-id" } };
const result = await graph.invoke(
  { runId: "server-generated-run-id", userId: "authenticated-user-id" },
  config,
);
```

The example shows the shape of a graph, not complete production code: implement `discoverAndPersistJobs`, validate state, use transaction-safe repositories, add node-level retry/timeout policies, enforce budgets, stream progress events, and use `interrupt()`/`Command` in the dedicated approval workflows. Do not expose internal graph state or stack traces to the frontend.

## 6. Job source strategy

### Phase 1: sources to implement

- **Greenhouse public job board:** fetch public job data using documented endpoints. Do not assume the public GET endpoint grants access to submit applications; the application endpoint has separate authentication requirements.
- **Lever public postings:** use its documented postings endpoints, observe applicable limits, and follow the API's required application flow when implementing any submission capability.
- **Company-specific career pages:** store the company's official careers URL and add a connector only when a stable, permitted feed/API exists.
- **Manual job URL import:** the user pastes a job URL and description; the tool extracts the job details and keeps the canonical application URL.
- **Opt-in email alerts:** add later, with explicit email permissions and a visible way to disconnect.

Official references:
- Greenhouse Job Board API: https://docs.greenhouse.io/job-board.html
- Lever Postings API: https://github.com/lever/postings-api

Do not promise full coverage of all India job boards. Some job sites restrict third-party collection or application automation. Add connectors one at a time and document each connector's permissions, fields, limits, and fallback behavior. Do not scrape behind login walls or bypass CAPTCHAs, access controls, throttling, or anti-bot mechanisms.

### Adapter interface

```ts
export type NormalizedJob = {
  source: string;
  sourceJobId: string;
  company: string;
  title: string;
  locationText: string | null;
  workplaceType: "onsite" | "hybrid" | "remote" | "unknown";
  employmentType: string | null;
  descriptionText: string;
  requirementsText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  applyUrl: string;
  jobUrl: string;
  sourceApiUrl: string | null;
  eligibilityNotes: string[];
};

export interface JobSourceAdapter {
  name: string;
  discover(): Promise<NormalizedJob[]>;
  getJob?(sourceJobId: string): Promise<NormalizedJob | null>;
}
```

Store ingestion errors per source. A failed connector must not block other sources. Implement backoff and sensible request limits. Never represent an inferred posted date as verified.

## 6A. Resource Library and spreadsheet ingestion

This is a first-class feature because the candidate may upload placement-cell Excel sheets, company target lists, recruiter/contact trackers, job opening spreadsheets, role eligibility notices, resumes, certificates, project descriptions, job descriptions, and other preparation resources.

### Supported input types

- **XLSX/XLS/CSV:** structured openings, company lists, eligibility columns, role and location preferences, job URLs, referral/contact details, existing application trackers, and skill matrices. XLS parsing should be enabled only if a maintained parser is chosen and tested; CSV is preferred for simple data.
- **PDF/DOCX/TXT/Markdown:** placement notices, role descriptions, company information, resume/project evidence, hiring instructions, and interview preparation material.
- **User-provided URLs:** official careers pages, ATS job listings, employer information, and public documents the user is authorized to access.
- **Later optional types:** email exports and calendar data, only with explicit consent and narrowly scoped permissions.

Do not run VBA/macros, embedded scripts, formulas, or active content from uploaded files. Treat file content as data, not as executable instructions. Set upload size, row-count, and page-count limits. Validate file signatures/MIME types, store uploads privately, scan where tooling is available, and never serve files from a public web directory.

### Import wizard UX

1. User uploads one or more files or pastes a link.
2. App creates a private `resource_file` record, computes a content hash, and marks processing status.
3. Parser extracts workbook sheet names, column headers, row numbers, document text, and links. It does not execute spreadsheet formulas or macros; formula cells should use cached values when available and flag missing cached values for review.
4. Classifier proposes one of these resource types: `job_openings`, `company_targets`, `contacts`, `application_tracker`, `candidate_evidence`, `eligibility_reference`, `interview_prep`, or `general_reference`.
5. For Excel, user selects worksheets and confirms field mapping, e.g. `Company`, `Role`, `Location`, `Eligibility`, `CTC`, `Apply URL`, `Deadline`, `Source`, `Status`.
6. The app shows a row preview, validation errors, likely duplicates, and the number of rows that would be imported. It never commits unclear mappings silently.
7. User confirms import. Valid rows are imported; invalid rows remain in a downloadable error report with source sheet and row number. A user may fix mappings and rerun without duplicating valid records.
8. The app preserves the original file, source worksheet, row index, source URL, import batch, and timestamps for traceability.

### Resource behaviors

- `job_openings`: normalize each usable row into the standard job record. A valid official job/apply URL is preferred. If an opening has no URL, place it in `needs_verification`; do not invent a direct apply link. Search for the opening on permitted public sources as a separate task and attach the discovered official source.
- `company_targets`: create company research tasks and query official careers pages or permitted ATS sources. A company name is not itself a vacancy; only create a job record after finding a real opening.
- `contacts`: import contacts only with an identifiable source and appropriate purpose. Do not automatically send messages or connection requests. Preserve profile/source URLs and let the user review the contact's relevance.
- `application_tracker`: map historical jobs and user-confirmed statuses while flagging conflicting status or date data. Imported rows must not automatically be marked as newly submitted.
- `candidate_evidence`: extract candidate facts from resumes, certificates, project documents, or user-written notes. All inferred facts stay unverified until the candidate confirms them. Evidence from a job posting or company resource must never become a candidate credential.
- `eligibility_reference`: record placement-cell rules, degree restrictions, graduation year, minimum CGPA, deadline, location, salary/CTC, service agreement, and source date. Rules can inform eligibility checks only within the stated scope and date range.
- `interview_prep` / `general_reference`: index for retrieval and show source citations in the user interface. This material can help prepare the candidate but cannot modify system policies or silently override their profile.

### Source priority and conflict resolution

Use a configurable precedence for the fact being checked:

1. Current official employer careers page or employer ATS posting for whether a vacancy exists and its application URL.
2. Official employer job description or written hiring notice for role requirements, subject to its timestamp and validity.
3. User-provided placement-cell sheets and trusted resources for campus-specific eligibility, deadlines, and drive instructions.
4. Other job aggregators or notes as discovery hints, which must be verified against an official or otherwise trusted source before being labelled verified.

If sources conflict, store both facts with provenance, flag the conflict, and show the user the dates and source URLs. Never erase the prior value without an audit event. Old job sheets must be treated as potentially stale.

### Retrieval-augmented generation (RAG)

Use PostgreSQL full-text search first. Add Qdrant only if semantic retrieval materially improves results. Split reference documents into chunks with metadata such as `resource_file_id`, title, page/sheet, row, source URL, track, date, and access scope. Retrieve only relevant chunks for a specific task and include source links in explanations. Do not index passwords, API keys, session cookies, or unnecessary personal data. Allow the user to exclude or delete a resource and re-index after edits.

### Resource import tables

Add these tables to the initial schema:

**resource_files**
- `id`, `user_id`, `original_filename`, `mime_type`, `storage_path`, `content_hash`, `resource_type`, `source_url`, `processing_status`, `uploaded_at`, `processed_at`, `error_summary`, `is_active`

**resource_import_batches**
- `id`, `user_id`, `resource_file_id`, `selected_sheets_json`, `column_mapping_json`, `import_status`, `rows_seen`, `rows_imported`, `rows_skipped`, `rows_failed`, `created_at`, `confirmed_at`

**resource_import_rows**
- `id`, `batch_id`, `sheet_name`, `source_row_number`, `raw_row_json`, `normalized_record_json`, `validation_status`, `validation_errors_json`, `target_record_type`, `target_record_id`, `created_at`

**resource_chunks** (only if document retrieval is enabled)
- `id`, `user_id`, `resource_file_id`, `chunk_index`, `text_content`, `metadata_json`, `embedding_ref` (nullable), `created_at`

Use database-level access controls through authenticated ownership checks. Do not store all imported workbook contents in a shared global vector index without per-user isolation.

### API route plan additions

- `POST /resources/upload`
- `GET /resources`
- `GET /resources/:resourceId`
- `POST /resources/:resourceId/process`
- `GET /resources/:resourceId/preview`
- `PATCH /resources/:resourceId/mapping`
- `POST /resources/:resourceId/confirm-import`
- `GET /resources/import-batches/:batchId/errors`
- `PATCH /resources/:resourceId/type`
- `DELETE /resources/:resourceId`
- `POST /companies/import-search-tasks` (turn company-list rows into research tasks; it does not fabricate job openings)

### Acceptance criteria

- Upload an Excel sheet with multiple worksheets and preview the selected sheet before import.
- Map differently named columns to the normalized schema.
- Report invalid rows with file name, worksheet, row number, and reason.
- Import valid rows only after confirmation; re-importing the same file is idempotent.
- Preserve source URLs and row-level provenance, deduplicate jobs by canonical URL/source ID, and flag possible duplicates for review.
- Company-only lists create search tasks, not fake job records.
- Candidate claims extracted from resources remain unverified until confirmed by the user.
- Resource retrieval is filtered by user and job-search track and cites the source material used.
- A malformed, oversized, or unsupported file fails with a clear error without breaking other imports.

## 7. Job matching model

### Apply hard filters first

Hard filters should be configurable per search profile:

- India eligibility / work authorization if stated
- Fresher, graduate, trainee, internship, or entry-level suitability
- Graduation year and branch/degree requirements
- Employment type
- Location/remote requirements
- Candidate's mandatory salary minimum, when compensation is disclosed
- Explicit must-have skills or years of experience

Missing information should lower confidence rather than automatically mean “not eligible.” Surface a warning when branch/degree eligibility cannot be determined.

### Initial weighted score (0–100)

| Criterion | Weight |
|---|---:|
| Skill and project evidence overlap | 30 |
| Seniority / experience fit | 20 |
| Degree, branch, and graduation eligibility | 15 |
| Role-family fit | 10 |
| Location / work-mode preference | 10 |
| Required keyword / responsibility overlap | 10 |
| Compensation fit (only when comparable data exists) | 5 |

Adjust weights after observing actual results. This score is a **relevance estimate**, not a probability of getting hired. Show score components, matched evidence, missing requirements, and data-confidence level. Never silently auto-apply based on the score alone.

### Example result

```json
{
  "score": 82,
  "confidence": "medium",
  "eligible": "likely",
  "matchedEvidence": [
    { "requirement": "React", "profileFactIds": ["skill-react-1"] },
    { "requirement": "REST APIs", "profileFactIds": ["project-portal-api"] }
  ],
  "gaps": ["PostgreSQL experience is requested; verify depth before applying"],
  "reasons": ["Entry-level title", "Hyderabad location", "Relevant full-stack project evidence"],
  "warnings": ["Salary not disclosed"]
}
```

In production, validate this shape with Zod and reject malformed output before saving it.

## 8. Verified candidate facts and resume tailoring

### Profile entities

Store candidate facts as evidence-backed records, not one large unstructured prompt. Each fact should include:

- `id`
- `category` (education, skill, experience, project, credential, achievement, preference)
- `value`
- `source` (resume upload, user entry, verified URL, certificate)
- `sourceRef`
- `verifiedByUser`
- `createdAt` / `updatedAt`
- optional `validFrom` / `validUntil`

For projects, collect the actual problem, functionality, tech stack, candidate's personal contribution, deployment/source link, and metrics only when the candidate can substantiate them.

### Resume generation rules

- Use a single-column layout, standard headings, consistent dates, and selectable text.
- Avoid tables, multi-column designs, skill bars, icons, decorative graphics, and critical details inside headers/footers.
- Use the job description's accurate terminology when supported by verified evidence.
- Prefer concise, result-oriented bullets; never fabricate numeric impact.
- Preserve the exact degree, dates, employer names, certifications, and project facts.
- Add a “not yet confirmed” warning instead of making a guess.
- Generate a diff of the candidate's base resume against the tailored version.
- Let the candidate edit and approve before using a version.
- Keep a permanent association between each submitted application and the exact resume version used.

### AI output contract

Have the model return structured data rather than an entire unvalidated document:

```ts
const TailoredResumeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.object({
    name: z.string(),
    evidenceFactIds: z.array(z.string())
  })),
  experienceBullets: z.array(z.object({
    text: z.string(),
    evidenceFactIds: z.array(z.string()),
    changedFromBase: z.boolean()
  })),
  projectBullets: z.array(z.object({
    projectFactId: z.string(),
    text: z.string(),
    evidenceFactIds: z.array(z.string())
  })),
  missingEvidence: z.array(z.string()),
  warnings: z.array(z.string())
});
```

Before rendering, check that every `evidenceFactId` belongs to the candidate and that each claim is entailed by the referenced facts. If a claim cannot be validated, remove it or ask the candidate to confirm it.

## 9. Applying to jobs safely

### Application workflow states

`discovered → matched → ready_for_review → approved → application_opened → submitted_pending_confirmation → applied → interview → offer`

Other terminal states: `rejected`, `withdrawn`, `closed`, `not_eligible`, `duplicate`.

Only mark a job `applied` when there is a reliable confirmation (user confirmation or a permitted application receipt). Opening an application URL is not proof of submission.

### What to automate

- Prepare tailored files and answers
- Populate a pre-application checklist
- Open the original job application page
- Autofill fields only through a user-triggered, permitted mechanism
- Store the exact resume, cover letter, and answer set used
- Set a follow-up reminder

### What must remain controlled

- Final submission unless a documented, authorized application API is available and explicitly enabled
- Any question involving legal declarations, work authorization, compensation expectations, sponsorship, demographic information, background checks, or consent
- CAPTCHA/MFA and access-control steps (never bypass them)
- Any answer the system cannot support from verified facts

### Duplicate prevention

Use a unique constraint on `(user_id, normalized_company, normalized_role, canonical_job_id)` and a secondary duplicate check on normalized title + company + application URL. Warn the user before applying to substantially identical listings.

## 10. Hiring-team research and outreach

### Discovery

For a selected job, generate search queries such as:

- `"Company Name" talent acquisition software engineer India`
- `"Company Name" technical recruiter Hyderabad`
- `"Company Name" engineering manager team`
- `site:company-domain.com careers recruiter talent acquisition`

Use an approved search provider or manual research. Save the source URL and timestamp. Do not harvest LinkedIn profile information via automated scraping. A user can manually open and inspect a LinkedIn profile and then save the information they choose to keep.

### Contacts table fields

- `companyId`
- `jobId` (nullable)
- `name` (only if reliably sourced)
- `roleTitle`
- `contactType` (recruiter, talent acquisition, hiring manager, team member, referral contact)
- `profileUrl` / `publicSourceUrl`
- `sourceName`
- `relevanceReason`
- `confidence`
- `outreachStatus` (researching, draft_ready, user_sent, replied, no_response, closed)
- `lastContactedAt`
- `nextFollowUpAt`
- `notes`

### Outreach drafting

- Draft a short connection note tied to the role and the candidate's real experience.
- Avoid false familiarity, fake referrals, fabricated mutual connections, or claims that someone reviewed the resume.
- Make it clear the candidate is a fresher when relevant.
- Draft a first follow-up only after the candidate records that a message was sent.
- Limit follow-ups; use a reasonable one-time reminder rather than repeatedly messaging people.
- The system can schedule a reminder and prepare a draft, but the user manually sends LinkedIn messages.

### Example prompt

> Write a brief, respectful LinkedIn connection note for the candidate to review. Use only the verified candidate facts and the supplied job/company context. Do not claim prior contact, a referral, or a relationship that is not in the facts. Do not ask for a job offer. State a specific, honest reason for connecting. Maximum 280 characters. Output the note and a list of fact IDs used.

## 11. Application tracker and follow-up intelligence

For each application, keep:

- company, title, location, job URL, source, eligibility status, match score
- resume version ID, cover-letter version ID, answer-set version ID
- discovered, reviewed, approved, submitted, and last-updated timestamps
- status and status-change history
- recruiter/contact links and outreach history
- reminders and next action
- interview dates, preparation notes, and outcome
- rejection reason if supplied
- offer compensation and terms entered by the candidate

### Follow-up rules

- After an application is confirmed: recommend a reminder based on the employer's stated timeline; otherwise use a configurable default, such as 5–7 business days.
- After the candidate confirms a LinkedIn message was sent: allow a follow-up reminder after a configurable interval, such as 5–7 business days. Avoid repeated unsolicited messaging.
- If a reply arrives: pause the pending follow-up and prompt the candidate to respond.
- If a rejection/closed-job notice arrives: mark the application accordingly and suppress future follow-ups.

## 12. Database schema (initial)

Use UUID primary keys, UTC timestamps, foreign keys, and migrations. This is a starting model; normalize further while implementing.

### Core tables

**users**
- `id`, `email` (unique), `password_hash`, `created_at`, `updated_at`

**candidate_profiles**
- `id`, `user_id`, `full_name`, `email`, `phone`, `city`, `country`, `degree`, `branch`, `graduation_year`, `headline`, `summary`, `base_resume_file_id`, `created_at`, `updated_at`

**profile_facts**
- `id`, `user_id`, `category`, `label`, `value_json`, `source_type`, `source_ref`, `verified_by_user`, `created_at`, `updated_at`

**search_preferences**
- `id`, `user_id`, `name`, `target_roles_json`, `locations_json`, `work_modes_json`, `employment_types_json`, `min_salary`, `currency`, `fresher_only`, `required_skills_json`, `excluded_companies_json`, `is_active`

**job_sources**
- `id`, `name`, `source_type`, `base_url`, `config_json`, `is_enabled`, `last_success_at`, `last_error_at`, `last_error_message`

**jobs**
- `id`, `source_id`, `source_job_id`, `company`, `title`, `location_text`, `workplace_type`, `employment_type`, `description_text`, `requirements_text`, `salary_min`, `salary_max`, `salary_currency`, `posted_at`, `first_seen_at`, `last_seen_at`, `job_url`, `apply_url`, `canonical_hash`, `is_active`, `source_data_json`
- Unique index: `(source_id, source_job_id)`

**job_matches**
- `id`, `user_id`, `job_id`, `preference_id`, `score`, `confidence`, `eligibility`, `matched_evidence_json`, `gaps_json`, `reasons_json`, `warnings_json`, `created_at`

**documents**
- `id`, `user_id`, `job_id` (nullable), `document_type`, `version_number`, `file_path`, `mime_type`, `content_hash`, `content_json`, `based_on_document_id`, `approval_status`, `created_at`, `approved_at`

**applications**
- `id`, `user_id`, `job_id`, `status`, `resume_document_id`, `cover_letter_document_id`, `answer_set_json`, `submitted_at`, `confirmation_type`, `notes`, `created_at`, `updated_at`
- Unique/duplicate checks should prevent repeated applications to the same job.

**application_events**
- `id`, `application_id`, `event_type`, `from_status`, `to_status`, `details_json`, `created_at`

**contacts**
- `id`, `user_id`, `company_name`, `job_id`, `name`, `role_title`, `contact_type`, `profile_url`, `source_url`, `source_name`, `confidence`, `relevance_reason`, `outreach_status`, `last_contacted_at`, `next_follow_up_at`, `notes`, `created_at`, `updated_at`

**outreach_drafts**
- `id`, `user_id`, `contact_id`, `application_id` (nullable), `channel`, `draft_type`, `body_text`, `evidence_fact_ids_json`, `approval_status`, `sent_by_user_at`, `reply_received_at`, `created_at`

**audit_events**
- `id`, `user_id`, `action`, `entity_type`, `entity_id`, `metadata_json`, `created_at`

**ai_usage_events**
- `id`, `user_id`, `model`, `operation`, `input_tokens`, `output_tokens`, `estimated_cost`, `latency_ms`, `success`, `created_at`

**resource_files**
- `id`, `user_id`, `original_filename`, `mime_type`, `storage_path`, `content_hash`, `resource_type`, `source_url`, `processing_status`, `uploaded_at`, `processed_at`, `error_summary`, `is_active`

**resource_import_batches**
- `id`, `user_id`, `resource_file_id`, `selected_sheets_json`, `column_mapping_json`, `import_status`, `rows_seen`, `rows_imported`, `rows_skipped`, `rows_failed`, `created_at`, `confirmed_at`

**resource_import_rows**
- `id`, `batch_id`, `sheet_name`, `source_row_number`, `raw_row_json`, `normalized_record_json`, `validation_status`, `validation_errors_json`, `target_record_type`, `target_record_id`, `created_at`

**resource_chunks** (only if retrieval is enabled)
- `id`, `user_id`, `resource_file_id`, `chunk_index`, `text_content`, `metadata_json`, `embedding_ref`, `created_at`

## 13. API route plan

Prefix all endpoints with `/api/v1`. Validate request and response bodies with Zod. Require authentication for personal data.

### Profile
- `GET /profile`
- `PATCH /profile`
- `POST /profile/import-resume`
- Resource upload/import endpoints are listed in Section 6A.
- `GET /profile/facts`
- `POST /profile/facts`
- `PATCH /profile/facts/:factId`
- `DELETE /profile/facts/:factId`

### Jobs
- `GET /jobs?search=&location=&minScore=&source=&status=`
- `GET /jobs/:jobId`
- `POST /jobs/import-url`
- `POST /jobs/sync` (admin/self-only initially)
- `POST /jobs/:jobId/match`
- `POST /jobs/:jobId/hide`

### Documents
- `POST /jobs/:jobId/resume-draft`
- `POST /jobs/:jobId/cover-letter-draft`
- `GET /documents/:documentId`
- `POST /documents/:documentId/approve`
- `POST /documents/:documentId/export?format=pdf|docx`

### Applications
- `POST /jobs/:jobId/application-draft`
- `POST /applications`
- `GET /applications`
- `GET /applications/:applicationId`
- `PATCH /applications/:applicationId/status`
- `POST /applications/:applicationId/confirm-submission`
- `POST /applications/:applicationId/events`

### Hiring-team research / outreach
- `POST /jobs/:jobId/research-contacts`
- `GET /contacts`
- `PATCH /contacts/:contactId`
- `POST /contacts/:contactId/draft-outreach`
- `POST /outreach/:draftId/approve`
- `POST /outreach/:draftId/mark-sent`
- `POST /outreach/:draftId/mark-replied`

### Dashboard / settings
- `GET /dashboard/summary`
- `GET /dashboard/funnel`
- `GET /settings/ai-usage`
- `PATCH /settings/preferences`
- `POST /settings/export-data`
- `DELETE /settings/account-data`

Do not expose a route that silently sends LinkedIn connection requests or messages.

## 14. Suggested repository layout

```text
ai-career-agent/
├── apps/
│   ├── web/                         # React + Vite
│   │   └── src/
│   │       ├── pages/
│   │       ├── components/
│   │       ├── features/jobs/
│   │       ├── features/profile/
│   │       ├── features/resumes/
│   │       ├── features/applications/
│   │       ├── features/outreach/
│   │       └── features/resources/     # upload, preview, mapping, imports
│   └── api/                         # Express + TypeScript
│       └── src/
│           ├── app.ts
│           ├── server.ts
│           ├── routes/
│           ├── middleware/
│           ├── schemas/
│           ├── services/
│           │   ├── ai/
│           │   ├── matching/
│           │   ├── documents/
│           │   ├── applications/
│           │   ├── outreach/
│           │   ├── notifications/
│           │   ├── resources/              # parsing, validation, import batches
│           │   └── retrieval/              # optional resource search/RAG
│           ├── adapters/jobs/
│           ├── adapters/files/              # XLSX/CSV/PDF/DOCX parsers
│           ├── graphs/                      # LangGraph state, nodes, routes, checkpointer
│           │   ├── discovery.graph.ts
│           │   ├── application-prep.graph.ts
│           │   ├── submission.graph.ts
│           │   ├── outreach.graph.ts
│           │   ├── resource-import.graph.ts
│           │   ├── state.ts
│           │   └── checkpointer.ts
│           ├── repositories/
│           ├── jobs/                # queue workers that start/resume graphs
│           └── tests/
├── packages/
│   └── shared/                      # shared types and validation schemas
├── prisma/
│   └── schema.prisma
├── private-files/                   # local dev only; gitignored
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 15. Environment setup

Keep secrets in `.env` for local development and in the deployment provider's secret manager in production. Never commit `.env`, resume files, access tokens, or personal application answers.

`.env.example`:

```dotenv
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/career_agent
SESSION_SECRET=replace_with_a_long_random_value
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
LANGGRAPH_CHECKPOINT_DATABASE_URL=
REDIS_URL=redis://localhost:6379
PRIVATE_FILES_DIR=./private-files
```

Important:
- Fill `OPENAI_MODEL` with a model ID enabled for the OpenAI API project you actually use.
- `LANGGRAPH_CHECKPOINT_DATABASE_URL` can point to a dedicated PostgreSQL database/schema for graph checkpoints. If omitted, use `DATABASE_URL` only after checking permissions, backup strategy, and isolation requirements.
- Do not put the API key in React/Vite variables such as `VITE_OPENAI_API_KEY`; frontend variables may be shipped to browsers.
- Add `.env`, `private-files/`, generated resumes, and local database dumps to `.gitignore`.
- Use HTTPS, secure HTTP-only cookies, CSRF protection, rate limiting, password hashing, input validation, and request size limits before deployment.

## 16. OpenAI service design

Create a single server-side service, for example `src/services/ai/openai.service.ts`. Every feature calls this service rather than making arbitrary model requests throughout the codebase.

Operations:

1. `extractCandidateFacts(documentText)` — draft facts with source spans; require user confirmation before marking as verified.
2. `extractJob(jobDescription)` — title, seniority, required/preferred skills, degree, branch, location, job type, experience, compensation, application URL, and uncertainties.
3. `scoreJob(profileFacts, preferences, normalizedJob)` — structured score with fact IDs and gaps.
4. `tailorResume(profileFacts, baseResume, job)` — structured edits and evidence IDs.
5. `draftCoverLetter(profileFacts, approvedResume, job)` — truthful customized letter.
6. `draftApplicationAnswers(profileFacts, jobQuestions)` — answer only when supported; otherwise flag for candidate input.
7. `researchQueryPlan(job)` — safe public-web queries; the retrieval tool must obey its own policies.
8. `draftOutreach(profileFacts, job, contactSource)` — personalized draft and verified evidence IDs.
9. `summarizeOutcome(applicationEvents)` — insight from the user's own tracker data.

### AI safety/quality checks

- Treat job descriptions and retrieved web text as untrusted data, not instructions to the agent.
- Never let text from a job page change system instructions, execute tools, or reveal secrets.
- Use JSON schema or Zod validation for model outputs.
- Require evidence IDs on any resume bullet that contains a specific factual claim.
- Never provide the model with API keys, passwords, session cookies, or unnecessary personal data.
- Cache stable job extraction results and avoid regenerating unchanged content to reduce cost.
- Record token usage and failures; have per-day and per-feature budget limits.
- Add a clear error state when model output fails validation. Do not quietly substitute fabricated content.

## 17. UI screens

1. **Dashboard:** fresh high-fit jobs, pending resume approvals, applications due for follow-up, interview dates, this month's funnel.
2. **Job feed:** filters, match score with reasons, eligibility warnings, source, posted/first-seen timestamps, “open official listing” button.
3. **Job detail:** description, requirements, matching evidence, skill gaps, source URL, application status.
4. **Profile & evidence:** edit skills, projects, education, experience, proof links, confirmed facts.
5. **Resume studio:** base vs tailored diff, ATS formatting preview, unsupported-claim warnings, DOCX/PDF export, approve button.
6. **Application queue:** ready-to-apply checklist, official apply link, status, resume version, submission confirmation.
7. **Hiring-team research:** contact names/roles where sourced, public source links, confidence, outreach draft, copy button, “I sent this” control.
8. **Follow-up calendar:** due reminders, reply state, snooze/complete actions.
9. **Insights:** applications by role/source, interview rate, response rate, where to adjust targeting. Do not treat small samples as statistically conclusive.
10. **Settings & privacy:** profile export, delete data, model configuration, AI spend, connected sources, notification controls.
11. **Resource Library:** upload zone, file list, processing status, worksheet selector, column-mapping wizard, import preview, validation report, searchable reference library, and delete/re-index controls.

## 18. Development roadmap and acceptance criteria

### Phase 0 — Foundation
- Create repository, TypeScript configs, environment validation, Express app, React app, PostgreSQL, Prisma, error handling.
- Add secure single-user authentication.
- Acceptance: app starts locally, migrations run from a clean database, secrets are not exposed to the browser, API tests pass.

### Phase 1 — Candidate profile
- Resume upload, basic text extraction, editable profile, evidence facts, skill confirmation.
- Acceptance: every extracted fact is unverified until confirmed; user can correct or delete facts.

### Phase 1.5 — Resource Library and imports
- Implement private uploads for XLSX/CSV/PDF/DOCX/TXT; show processing state and file errors.
- Build worksheet selection, field mapping, preview, row validation, import confirmation, and idempotent imports.
- Add company target list handling and source-linked reference retrieval.
- Acceptance: imported data always preserves provenance; invalid rows can be repaired; company names never become fabricated job records.

### Phase 2 — Job ingestion
- Implement manual URL import plus first public ATS adapter; add second adapter only when the first is tested.
- Normalize and deduplicate jobs; record source metadata.
- Acceptance: rerunning sync does not create duplicates; a source failure is visible and does not stop other sources; original apply URLs are retained.

### Phase 3 — Matching
- Implement hard filters, weighted scoring, fit explanation, gaps, confidence, saved preferences.
- Acceptance: test fixtures cover eligible, ineligible, and uncertain roles; UI never labels a fit score as a hire probability.

### Phase 4 — Resume studio
- Implement structured AI output, evidence validation, diff UI, DOCX/PDF export.
- Acceptance: unsupported claims are blocked or flagged; generated content is editable; a tailored version can be tied to an application.

### Phase 5 — Application tracking
- Ready-to-apply checklist, official application link, candidate confirmation, event history, duplicate protection.
- Acceptance: opening a form never changes an application to “applied”; only confirmation records a submission.

### Phase 6 — Hiring-team research
- Create public-source query plans; add researched contacts with source URLs; draft notes and follow-ups.
- Acceptance: no LinkedIn scraping or automated LinkedIn actions; draft must cite the profile facts and job context it relies on; candidate can copy/edit manually.

### Phase 7 — Background tasks & notifications
- Redis/BullMQ, scheduled syncs, daily digest, follow-up reminders, retry and backoff.
- Acceptance: jobs are idempotent, can be retried, and cannot send duplicate notifications after a retry.

### Phase 8 — Optional application adapters
- Evaluate one ATS at a time. Check official documentation and permissions; implement form preparation or application submission only within documented authorization.
- Acceptance: per-ATS tests, rate limits, audit log, user approval gate, no CAPTCHA/MFA bypass, safe fallback to the official form.

### Phase 9 — Production readiness
- Monitoring, backups, rate limiting, data export/deletion, retention rules, privacy review, budget caps, accessibility, deployment.
- Acceptance: restore test succeeds; user can delete their personal data; API keys and documents are not publicly accessible.

## 19. Minimum testing matrix

- Empty/invalid resume upload, large file, malformed PDF, duplicate file
- Job posting with missing salary, missing posted date, remote location, degree restriction
- Ineligible role, uncertain branch requirement, senior role wrongly labeled fresher
- Model returns invalid JSON, unknown evidence ID, or invented metric
- Document export includes selectable text and standard headings
- Duplicate job appears from two sources
- Re-running ingest is idempotent
- Application opened but not submitted
- User confirms submission twice
- Recruiter reply arrives before scheduled follow-up
- Source connector fails or rate-limits
- OpenAI rate limit, timeout, quota failure, and malformed response
- Authenticated user attempts to access another user's records
- API key absent from frontend bundle and source maps

## 20. Product success metrics

Include Resource Library metrics: successful import rate, invalid-row rate, duplicate rate, proportion of openings with verified official URLs, and the number of company targets that convert into verified openings. Do not optimize for raw import volume alone.

Track the quality of the job search rather than vanity volume:

- Relevant jobs found per week
- Percentage of recommendations the candidate approves
- Percentage of listings verified as open before applying
- Application completion rate
- Interview callbacks per submitted application (by role family and source)
- Response rate to respectful outreach
- Time spent per application
- Number of factual corrections needed in generated resumes
- Spend per generated resume and per application packet
- Number of duplicate/stale listings filtered out

Do not infer causality from tiny samples. Compare trends over time and keep role categories separate.

## 21. Practical job-search strategy: three independent tracks

Never treat the candidate's entire profile as one generic resume. Maintain separate preferences, evidence emphasis, scoring, resume template, target keywords, and interview-prep checklist for each track.

### Track A — Software and IT

Target roles: Graduate Software Engineer, Software Engineer Trainee, Backend Developer, Full-stack Developer, Frontend Developer, QA Engineer, and carefully selected AI application roles. Filter by graduation year, degree/branch eligibility, fresher suitability, location, and the technologies genuinely supported by project evidence. Current candidate facts to confirm include Java, JavaScript, React, Node.js, PostgreSQL/SQL, APIs, Git, and projects involving retrieval-augmented generation or Qdrant.

### Track B — Core EEE

Target roles: Graduate Electrical Engineer, Electrical Design Trainee, Electrical Testing Engineer, Maintenance Engineer, Power Systems/Protection Trainee, Renewable Energy Trainee, EV electrical roles, and eligible electrical engineering graduate programs. Do not require software skills unless the job explicitly does. The EEE evidence library can track subjects and tools such as electrical machines, power systems, protection, circuit analysis, AutoCAD Electrical, PLC/SCADA, MATLAB/Simulink, and power-system simulation—but each skill must be confirmed by the candidate before it is presented as a proficiency.

### Track C — Business and Data Analyst

Target roles: Business Analyst Trainee, Data Analyst, Reporting Analyst, Product/Operations Analyst, and suitable Quality Analyst roles. Match based on SQL/PostgreSQL, spreadsheets, data cleaning, reporting, requirements gathering, process mapping, stakeholder communication, and statistics only when the job asks for them and the candidate can demonstrate evidence. Keep BA/analyst resumes distinct from both software and core EEE resumes.

### Track-specific scoring presets

These are starting weights to tune through actual application outcomes, not hiring probabilities:

| Criterion | Software/IT | Core EEE | Business/Data Analyst |
|---|---:|---:|---:|
| Relevant skills and project/evidence overlap | 30 | 25 | 30 |
| Seniority / fresher eligibility | 20 | 20 | 20 |
| Degree, branch, graduation-year eligibility | 15 | 20 | 15 |
| Role responsibilities and keyword overlap | 15 | 15 | 15 |
| Location and work-mode preferences | 10 | 10 | 10 |
| Compensation fit when disclosed | 5 | 5 | 5 |
| Interest / chosen role-family preference | 5 | 5 | 5 |

Apply hard eligibility checks before scoring. Unknown requirements should be flagged as unknown rather than falsely treated as satisfied or failed. Keep each track's results and funnel metrics separate.

## 22. Definition of done for the first usable version

The first version is successful when the candidate can:

1. Upload a resume and review the extracted facts.
2. Set graduation year, degree/branch, target roles, geography, work mode, and salary preference.
3. Sync supported job feeds and import an individual job URL.
4. View fresh, deduplicated jobs ranked with transparent reasons.
5. Generate a truthful per-job ATS-friendly resume and cover letter.
6. Review changes and approve/download DOCX/PDF files.
7. Open the official application page and record a confirmed application.
8. Research a potential recruiter/hiring contact from a permitted public source.
9. Draft a personalized note, manually send it, and set a follow-up reminder.
10. See all actions and status changes in one dashboard.

**Build order:** Foundation → profile/evidence → job ingestion → matching → resume studio → tracker → research/outreach → scheduled workers → narrowly scoped application integrations.


## 23. Tsenta-inspired product experience and functional parity plan

Use the four-stage product model as a design reference while keeping the implementation and branding original.

### Find — match feed

- A dashboard for fresh jobs, recent source updates, high-fit roles, saved jobs, and roles requiring eligibility review.
- Filters for track, role title, graduation year, degree/branch, city/state, remote/hybrid/on-site, experience level, salary where known, source, and date first seen.
- Job cards show company, exact title, location, source/official apply link, first-seen timestamp, fit score, track label, and the top reasons/gaps.
- Support saved searches such as `Software — Hyderabad — Fresher`, `Core EEE — Telangana/India — Graduate`, and `Business Analyst — Hyderabad/India — Trainee`.
- Use scheduled sync and deduplication for permitted sources. Display connector health and never imply total-market coverage.

### Prep — resume studio

- Upload and maintain one base resume plus separate track-specific resume profiles.
- Per vacancy, show a job-description summary, verified matching evidence, gaps, a tailored resume draft, optional cover letter, and answers to common application questions.
- Add a before/after diff and highlight claims that lack evidence.
- Export DOCX/PDF using readable, single-column ATS-friendly formatting.
- Store each document version against the job and require approval before it is used for submission.

### Apply — controlled application queue

- Queue states: `new_match`, `review_needed`, `documents_ready`, `approved_to_apply`, `application_opened`, `submitted_pending_confirmation`, `applied_confirmed`, `blocked`, `closed`.
- Provide a ready-to-apply checklist and a prominent official application URL.
- Implement source-specific adapters only when documented APIs or permissions allow the action. A public vacancy API is not by itself proof that application submission is authorized.
- If submission automation is not supported, provide a complete application packet and one-click open of the employer form; never claim that the job was applied to until a receipt or user confirmation exists.
- Do not bypass MFA, CAPTCHA, anti-bot protections, or application declarations. Require human input for legal or sensitive attestations and uncertain answers.

### Track — pipeline and contact follow-ups

- Kanban/list views for discovered, selected, applied, recruiter response, assessment, interview, offer, rejected, and withdrawn.
- A timeline/receipt stores the source, exact documents and answer set, submission confirmation, and every status transition.
- Hiring-team workspace stores role/name only when reasonably sourced, public source URL, relevance reason, confidence, notes, draft message, sent-by-user state, response status, and next follow-up date.
- Provide copy-ready LinkedIn connection notes and follow-up drafts, but do not scrape LinkedIn or automatically connect/message. The user reviews and sends messages manually unless LinkedIn explicitly authorizes an integration.
- Optionally add Gmail OAuth later to correlate permitted recruiter replies with known applications; use least-privilege scopes and provide disconnect/delete controls.

### Multi-surface plan

1. **MVP:** responsive web dashboard with the four stages above.
2. **V1:** scheduled background sync, daily digest, email notifications, bulk review of generated documents, and application outcome analytics.
3. **Later:** a browser extension for user-triggered assistance on supported pages, mobile-friendly notifications, or an MCP/CLI interface. Each surface must use the same permissions, audit trail, and approval rules as the web app.

Do not build the extension, mobile app, MCP server, and full ATS automation before the web MVP is proven. The primary quality metric is qualified applications and interview response—not raw application volume.

## 24. Track setup wizard and default preference examples

The onboarding wizard should ask the candidate to enable one or more separate tracks. Each track has its own mandatory questions and can be paused independently.

| Setting | Software/IT | Core EEE | Business/Data Analyst |
|---|---|---|---|
| Initial target level | Fresher / graduate / trainee | Graduate / GET / trainee | Trainee / fresher / entry-level |
| Degree filter | Configurable per posting | Must inspect EEE/branch restrictions | Must inspect degree/branch restrictions |
| Main proof | Software projects, code, APIs, internships | EEE projects/labs, relevant coursework, tools | SQL exercises, reports, analytics/business projects |
| Resume profile | Technical projects and stack | Electrical fundamentals and core projects | Analysis, SQL, reporting, communication |
| Special warnings | DSA or framework requirements | Shift/site/plant/location and safety requirements | Excel/SQL/case-study and communication requirements |
| Match scoring | Software competencies | Electrical competencies | Analytical and business competencies |

For any setting that has not been supplied by the candidate, leave it unset and request it in the onboarding flow. Do not infer salary expectations, relocation readiness, willingness to work shifts, certifications, or engineering tool proficiency.


## 25. One-click Agent Runner: the main experience

The dashboard must have a prominent **Run Agent** action. Clicking it opens a small setup panel with sensible defaults, then launches a durable background run and streams progress into the UI. It must not merely return a static recommendation or start an invisible browser bot.

### 25.1 Run modes

Provide the following options. The default first-run recommendation is **Daily Discovery — All Enabled Tracks**.

| Mode | What it does | Best time to use |
|---|---|---|
| **Daily Discovery (recommended)** | Searches all enabled tracks and permitted sources, deduplicates results, applies eligibility checks, scores matches, and displays the strongest new opportunities. | Normal daily run |
| **Focused Track** | Runs only Software/IT, Core EEE, or Business/Data Analyst using that track’s settings and resume evidence. | When focusing a career path |
| **Company List Sweep** | Reads selected company-target rows from the Resource Library, checks official career/ATS sources, and returns only real vacancies found. | After uploading an Excel list of companies |
| **New Jobs Since Last Run** | Fetches updates since each connector’s last successful sync and displays newly found or materially changed listings. | Fast refresh without redoing all searches |
| **Resource-Driven Search** | Uses selected Excel/PDF/DOCX/link resources to generate queries, eligibility rules, target employers, or job leads; verifies any proposed vacancy separately. | After providing new resources |
| **Prepare Selected Applications** | Generates a tailored resume, cover letter, and answer drafts for jobs that passed the candidate’s review. It does not send or submit anything by itself. | When ready to apply to chosen jobs |
| **Follow-up Review** | Surfaces due follow-ups, recruiter replies linked through an authorized source, upcoming deadlines, and stale application statuses. | Daily or weekly pipeline maintenance |

### 25.2 Run configuration

Use a compact panel, not a long form. Include:

- **Career tracks:** All enabled / Software & IT / Core EEE / Business & Data Analyst.
- **Sources:** All enabled permitted sources or a multi-select of configured connectors.
- **Freshness:** New since last run / last 24 hours / last 7 days / custom period. Never imply a source covers time periods it cannot verify.
- **Location:** candidate’s selected locations, remote, India-wide, relocation-ready only when user has set that preference.
- **Result cap:** a configurable limit, e.g. 25, 50, or 100 jobs per run; pagination and connector limits still apply.
- **Minimum fit score:** adjustable cutoff; show hard eligibility failures separately rather than hiding them.
- **Resume preparation:** off by default for discovery runs; optional to draft docs for selected high-fit roles after scoring.
- **Budget guard:** estimate and display expected OpenAI usage before a large run; enforce a per-run and monthly cap.
- **Approval policy:** search and draft automatically; require user approval for application submission, human attestations, and sending recruiter outreach.

The first run should ask the user to confirm the candidate profile, enabled tracks, locations, and whether relocation is acceptable. Never infer these preferences from IP address or an uploaded job listing.

### 25.3 Job-run lifecycle and progress UI

Use a persistent run state machine:

`queued → running → needs_review → completed | partially_failed | failed | canceled`

A run can be `completed` even if a few sources failed, as long as the source-level failures are disclosed. Track each connector separately.

While a run executes, show progress such as:

- Current stage: reading resources, querying sources, normalizing jobs, verifying links/status, deduplicating, applying eligibility rules, scoring matches, preparing summary.
- Counts: sources attempted/succeeded/failed; jobs discovered; duplicates removed; closed/stale jobs filtered; eligibility failures; new matches; high-fit matches needing review.
- Current connector/source label and last successful sync time.
- A readable error message and retry control per failed source.
- Pause/cancel support for queued work. Cancel should stop work not yet started; connector calls already in flight may finish but their results must be recorded.
- A results summary even when partial failure occurs; don't discard successful results because another source timed out.

Do not simulate human activity, randomize delays to evade detection, or launch a headless browser to scrape platforms against their terms. Work happens through supported APIs, public endpoints, licensed search APIs, official pages within their access rules, and user-provided material.

### 25.4 Post-run results

The result page should present these sections:

1. **Best Matches:** strongest eligible new jobs across the selected tracks, ordered by evidence-based fit and freshness. Add a clear track label so the user understands which resume to use.
2. **Needs Review:** strong candidates where branch/degree requirements, graduation year, sponsorship/work mode, posting date, salary, or eligibility language is unclear.
3. **Not Eligible / Low Fit:** optionally collapsed, with a short reason; retain them for auditing but keep the main feed focused.
4. **Source Issues:** connectors that failed, authentication that expired, rate-limit responses, and websites requiring manual review.
5. **Suggested Next Actions:** review top matches, generate docs for selected jobs, open official application pages, or set follow-up reminders.

Every job card needs the canonical job title, employer, location, role family, source name, official application URL, discovered/updated timestamp where verified, fit score plus its major positive/negative factors, eligibility state, and a clear status such as `verified_open`, `needs_verification`, `stale`, or `closed`.

Use “best matches” or “priority recommendations,” not “guaranteed jobs” or a predicted probability of getting hired. If a job listing does not expose posting date or salary, display “not provided” rather than hallucinating a value.

## 26. Multi-platform discovery strategy

The product should search across many places, but not use one method for every platform. Build connector adapters with a declared access method, permissions, last-success timestamp, source URL, rate limit, and fallback.

### 26.1 Priority tiers

**Tier 1 — Official employer/ATS sources (build first)**

- Company careers pages and their published openings.
- Greenhouse public Job Board API.
- Lever public Postings API.
- Ashby public Job Postings API, configured for listed public jobs only when exposing postings publicly.
- SmartRecruiters Posting API where its public/authorized access requirements are met.
- Official government/PSU/campus/graduate-program career pages relevant to the selected track.

These are valuable because they can lead to the employer’s canonical posting and application page. They still require validation, reasonable polling, and correct use of each API. Greenhouse’s public GET endpoints do not grant anonymous application-submission access; submission uses a separate authenticated endpoint. Lever’s documented postings API has defined capabilities and limitations. Ashby explicitly distinguishes public listed postings from unlisted postings. Sources: https://docs.greenhouse.io/job-board.html ; https://github.com/lever/postings-api ; https://developers.ashbyhq.com/docs/public-job-posting-api ; https://developers.smartrecruiters.com/docs/endpoints

**Tier 2 — Job aggregators/search APIs (enable after a key/config check)**

- Adzuna API or another licensed job-search API that supports the required country, filters, freshness, and terms.
- A separately configured general web-search API for finding official job pages and permitted job announcements.
- Other providers only after reviewing pricing, attribution rules, cache/storage limits, allowed reuse, geographic coverage, and API policies.

Adzuna’s documented API uses application credentials. Do not assume a developer key is free, unlimited, or guaranteed to cover every target role in India. Show connector status and quota. Official documentation: https://developer.adzuna.com/overview

**Tier 3 — Major job boards and communities**

Potential discovery targets may include LinkedIn Jobs, Naukri, Indeed, Foundit, Internshala, Wellfound, Cutshort, Instahyre, Unstop, Freshersworld, and relevant analyst/core-engineering portals. Add them through one of these methods only:

- an official API or approved partner/integration;
- a user-authorized email/job-alert connection, with narrow read-only permissions;
- a user-supplied export, spreadsheet, or individual posting URL;
- ordinary search results or links from a licensed search provider, followed by verification at the source’s public job page.

Do not scrape logged-in pages, extract private profile data, bypass CAPTCHAs or anti-bot protections, or automate account actions. In particular, LinkedIn prohibits unauthorized scraping and bots/unauthorized automated methods for connection and messaging actions. The app must not try to evade those restrictions by imitating a person. If an integration is unavailable, present a platform search link or request the user’s export instead. Current policy reference: https://www.linkedin.com/help/linkedin/answer/a1341543

### 26.2 Connector registry

Store a configuration record for every connector:

```ts
export type ConnectorConfig = {
  id: string;
  displayName: string;
  category: "official_ats" | "employer_careers" | "aggregator_api" | "job_board" | "user_resource";
  enabled: boolean;
  accessMode: "public_api" | "authorized_api" | "licensed_search" | "email_alert" | "user_supplied" | "manual_link";
  allowedActions: Array<"discover" | "fetch_details" | "verify_status" | "submit_application">;
  requiresCredentials: boolean;
  credentialStatus: "not_required" | "missing" | "connected" | "expired" | "error";
  lastSuccessfulSyncAt: string | null;
  lastErrorCode: string | null;
  termsReviewedAt: string | null;
};
```

The connector’s `allowedActions` must be set from documented permissions, not guessed by the AI. `submit_application` must remain disabled until the exact integration and user’s authorization support it.

### 26.3 Search query generation by role family

Generate query sets from templates and user-confirmed preferences, not a single generic query. Examples:

- Software/IT: `2027 graduate software engineer India`, `fresher backend developer Hyderabad`, `graduate trainee software engineer`, `entry level QA engineer`, plus skill variants derived from the candidate’s verified profile.
- Core EEE: `2027 electrical engineering graduate trainee India`, `GET electrical`, `graduate electrical engineer Hyderabad`, `power systems trainee`, `electrical testing fresher`, plus company and PSU career-site searches.
- Business/Data Analyst: `business analyst trainee fresher Hyderabad`, `data analyst graduate India`, `reporting analyst entry level`, `quality analyst trainee`, plus SQL/Excel requirements where supported by evidence.

These are search patterns, not claims that vacancies exist. Query generation must avoid repeated near-duplicates, record which queries and sources returned each job, and keep track-specific filters separate.

### 26.4 Deduplication and verification

Use a stable fingerprint derived from normalized company, title, location, job ID and canonical URL. When the same vacancy appears via several sources, store one canonical job with multiple source observations. Prefer the employer/ATS URL for application; keep aggregator URLs as discovery provenance.

Verification strategy:

1. Resolve the official source and canonical apply URL.
2. Fetch the posting again where permitted, and compare job ID/status/title.
3. Record `verified_open`, `needs_verification`, `stale`, or `closed`, along with checked time and method.
4. Before preparing a final application packet, recheck whether the job remains open.
5. Before any permitted API submission, recheck required fields and the live job state; still require user approval unless the user has expressly enabled an authorized workflow for that connector.

Do not claim that a search across selected sources represents every job available across India.

## 27. Agent-run backend, API and data model

### 27.1 API routes

Add routes:

- `POST /api/agent-runs` — validate configuration, estimate AI cost, create a run, and enqueue work.
- `GET /api/agent-runs` — list recent runs and their aggregate status.
- `GET /api/agent-runs/:id` — retrieve status, progress counters, source outcomes, results summary and timestamps.
- `POST /api/agent-runs/:id/cancel` — cancel pending work and stop scheduling new tasks.
- `POST /api/agent-runs/:id/resume` — resume a paused graph only after checking the authenticated user, the server-stored thread ID, and a matching unexpired approval record.
- `POST /api/agent-runs/:id/retry-failed-sources` — retry only failed/eligible connectors with backoff and quota checks.
- `GET /api/connectors` — return connector status, configured access modes, required setup and permission flags, but never credentials.
- `PATCH /api/connectors/:id` — enable/disable or update allowed user-facing configuration; privileged permission changes must be server-validated.
- `GET /api/agent-runs/:id/events` — stream progress via Server-Sent Events, or poll the status endpoint for a simpler MVP.

Use the same authenticated account scope and ownership checks on every route. Add input schemas, idempotency keys for run creation, rate limits, audit logs, and tests for duplicate button clicks.

### 27.2 Suggested tables

Add:

- `agent_runs`: id, owner_id, mode, selected_tracks JSONB, selected_connectors JSONB, filters JSONB, status, `graph_thread_id` (unique, server-generated), `current_stage`, created_at, started_at, finished_at, canceled_at, error_summary, discovered_count, verified_count, duplicate_count, high_fit_count, needs_review_count, estimated_cost_usd, actual_cost_usd.
- `agent_run_tasks`: id, run_id, task_type, connector_id, status, attempt_count, started_at, finished_at, error_code, safe_error_message, counters JSONB, idempotency_key.
- `agent_run_events`: id, run_id, timestamp, stage, severity, public_message, metadata JSONB. Never store API keys or sensitive full request headers in the event stream.
- `job_source_observations`: id, job_id, connector_id, external_job_id, source_url, canonical_url, observed_at, source_posted_at, raw_hash, verification_status, response_metadata JSONB.
- `connector_configs`: id, owner_id, connector_key, enabled, access_mode, allowed_actions JSONB, credential_reference, last_success_at, last_error_at, last_error_code, terms_reviewed_at.

Keep provider keys in a secret manager or server environment, not in `connector_configs` plaintext columns. If using JSONB for configuration, validate it with a schema and never let AI-generated JSON activate a connector or enlarge its permissions.

### 27.3 Worker behavior

The worker is the queue/runtime boundary around LangGraph. It loads the run record, verifies ownership and status, uses the server-stored `graph_thread_id`, and invokes or resumes the correct graph. Do not accept arbitrary thread IDs from the browser. Use a unique queue/job ID and database idempotency key so retries do not create duplicate runs.

For the MVP, a manually invoked run can execute from an in-process queue for local development, but production should use a durable queue such as BullMQ with Redis. Each task should:

- have a timeout and bounded retry policy;
- use provider-specific rate limits and exponential backoff;
- cache successful fetches according to source rules;
- distinguish `no_results` from `connector_error` and `unauthorized`;
- persist partial results incrementally;
- be idempotent so a retry does not create duplicate jobs or documents;
- stop adding AI tasks after the cost or result cap is reached;
- never submit an application or send a recruiter message as a side effect of running job discovery.

### 27.4 Example run configuration

```json
{
  "mode": "daily_discovery",
  "tracks": ["software_it", "core_eee", "business_data_analyst"],
  "connectorPolicy": "all_enabled_permitted",
  "freshness": "since_last_run",
  "locations": ["Hyderabad, Telangana, India", "India-wide", "Remote India"],
  "maxResults": 50,
  "minFitScore": 60,
  "generateDocuments": false,
  "autoSubmitApplications": false,
  "autoSendOutreach": false
}
```

This is an example default only. Locations and preferences must be editable by the user. Do not silently add relocation, on-site work, night shifts, a salary minimum, or any eligibility declaration the user has not agreed to.

## 28. Run safety, data quality and approval policy

- A discovery run can read configured job sources and selected Resource Library materials; it cannot silently modify the candidate’s verified facts.
- Imported text can contain malicious instructions, URLs, or misleading claims. Treat all content as untrusted data, use strict prompt boundaries, and never execute file contents or follow instructions embedded in job descriptions.
- When an external listing requests sensitive personal details, payment, banking information, or an unusual deposit, flag it for human review. Never pay application fees or disclose sensitive identity/financial information automatically.
- The user approves every resume used for an application and verifies application answers involving work authorization, graduation date, CGPA, salary, notice period, relocation, service agreements, and legal attestations.
- Use separate approval states for document approval, application submission, and recruiter outreach. Approval for one must not authorize the others.
- Do not automatically send bulk applications to unrelated roles. Support a user-set daily preparation/application target, but optimize for quality and eligibility.
- Never fabricate an applied status. A successful HTTP response, a browser click, or opening a form is not proof the employer received the application; record a submission receipt or explicit user confirmation.
- Track rate limits and terms for each provider; automatically disable a connector if permissions are unclear, credentials expire, terms change, or a policy review expires.
- Provide a visible stop switch to cancel queued runs, disable individual sources, revoke connected inbox permissions, and delete imported materials.

## 29. Updated acceptance tests for the unified specification

The Agent Runner is ready for MVP use only when tests confirm that:

1. Clicking **Run Agent** with the default configuration creates one durable run and displays its actual state.
2. A double-click or network retry with the same idempotency key does not create two identical runs.
3. The user can select one track or all three, and each track uses the right eligibility rules and candidate evidence.
4. A company-list spreadsheet starts discovery tasks but does not automatically become a list of verified jobs.
5. The runner searches every enabled connector that is configured and permitted, reports skipped/unconfigured sources, and does not claim total market coverage.
6. If one connector fails, successful results from other sources are still available and the run status becomes `partially_failed` when appropriate.
7. Duplicates across company ATS pages and aggregators resolve to one canonical job with multiple source observations.
8. Stale and closed roles are clearly marked and removed from the actionable queue.
9. Best Matches explain the score, eligibility status, supporting facts, gaps, source, and official application link.
10. The user can cancel a run, retry only failed sources, and inspect an audit trail.
11. Large runs stop at configured result or AI-spend limits and display when a limit was reached.
12. No discovery run submits applications, sends emails, clicks LinkedIn connection buttons, or messages people.
13. No secrets are exposed to the browser, run events, application logs, or generated files.
14. The UI remains useful with mocked connectors while live credentials are not configured; the UI must label such runs as test/demo rather than presenting mock openings as real jobs.

**Updated build order:** (1) auth/profile and the Resource Library; (2) connector registry plus two or three official ATS adapters; (3) persistent Agent Runner and a clear Best Matches feed; (4) track-specific match scoring; (5) resume studio and application packet; (6) additional permitted search integrations; (7) application tracker and outreach drafts; (8) scheduled runs, notifications, and source analytics. Build the Run Agent button and progress/results experience before adding broad source coverage, so the integration framework remains testable.


## 30. AI usage cost model and budget controls

AI prices and model availability can change. The application must not hard-code a price or assume that a ChatGPT-facing model name is a valid API model ID. Maintain a model configuration table or server-side config with the exact API model ID, effective input/output token price, pricing source URL, and last verification date. Confirm prices and available IDs against the official provider pages before deployment:

- Model catalogue: https://platform.openai.com/docs/models
- OpenAI API pricing: https://platform.openai.com/pricing
- OpenAI web search guide: https://developers.openai.com/api/docs/guides/tools-web-search

The OpenAI pricing page currently lists web search at **US$10 per 1,000 calls**, with search-content tokens also billed at the selected model's token rate. Treat this as a changing provider price, and verify it before setting production budget defaults.

### 30.1 Cost calculation

For each text-model operation, estimate token cost using the effective rates configured for that exact model:

`model_cost_usd = input_tokens / 1_000_000 * input_usd_per_million + output_tokens / 1_000_000 * output_usd_per_million`

Include cached-input rates if the selected model supports them and the API reports eligible cached tokens. Add tool charges separately:

`tool_cost_usd = web_search_calls * web_search_usd_per_call + other_tool_costs_usd`

`operation_cost_usd = model_cost_usd + tool_cost_usd`

Store estimated and actual cost separately. Use the provider's reported token usage whenever available. Estimated cost is for preflight display only; it is not a billing guarantee.

### 30.2 Discovery spend examples

At US$10 per 1,000 web-search calls, the direct search-call charge is approximately:

| Search calls | Direct search-call charge, excluding model tokens |
|---:|---:|
| 10/day for 30 days = 300 | US$3.00/month |
| 20/day for 30 days = 600 | US$6.00/month |
| 50/day for 30 days = 1,500 | US$15.00/month |
| 100/day for 30 days = 3,000 | US$30.00/month |

This table excludes model input/output tokens, any other provider tools, non-OpenAI job-search APIs, storage, email, hosting, and taxes. Use official company/ATS feeds and ordinary deterministic filters first; do not spend an LLM or web-search call on every candidate listing unnecessarily.

### 30.3 Model routing policy

Implement a configurable model router with task classes. Do not assume the cheapest model can handle every task equally well.

| Task | Default policy | Escalation condition |
|---|---|---|
| Job-field normalization | Rules/parser first; low-cost model only if needed | Required fields remain ambiguous |
| Eligibility and first-pass matching | Deterministic criteria and weighted score first | Conflicting or nuanced requirements |
| Detailed fit explanation | Cost-efficient model | Low confidence or contradictory source evidence |
| Resume/cover-letter draft | Cost-efficient model with verified facts and structured output | Validation fails or the role is unusually specialized |
| Application answers | Draft only from confirmed facts | Missing fact means ask candidate; never guess |
| Contact research planning | Deterministic query templates plus permitted search | Search results are ambiguous; save source URLs |
| Final factual audit | Independent rule-based check first; model review if warranted | An unsupported claim is detected or uncertain |

Use an exact model ID in `OPENAI_MODEL`; optionally support `OPENAI_MODEL_FAST` and `OPENAI_MODEL_QUALITY`, but only after verifying those IDs in the actual API project. Any example or UI label must be separate from the API model ID. A model that appears in ChatGPT does not necessarily have the same API availability, model ID, or price.

### 30.4 Budget controls

- Configure `AI_DAILY_BUDGET_USD`, `AI_MONTHLY_BUDGET_USD`, `AI_RUN_BUDGET_USD`, and `AI_MAX_CALLS_PER_RUN` as server-side controls.
- Display estimated spend before launching a run that could be large.
- Stop queuing new AI tasks when the run, daily, monthly, or per-feature cap is reached; keep and show results already collected.
- Let the user cancel a run without deleting already saved results.
- Cache successful extraction by normalized job content hash and model/prompt version. Reuse cached results until the source content or extraction schema changes.
- Avoid repeated resume generation when the source resume, job description, candidate evidence, and prompt version are unchanged.
- Use model calls only for tasks that benefit from language understanding. Use SQL, deterministic filters, canonical hashes, and ordinary code for sorting, deduplication, date comparison, and exact eligibility checks.
- Track per-task `input_tokens`, `output_tokens`, cached tokens where available, tool calls, estimated cost, model ID, latency, and status.
- Add alerts at configurable thresholds, such as 50%, 80%, and 100% of the monthly budget.
- If price metadata has not been refreshed, mark estimates as stale and use a conservative upper bound rather than promising a precise amount.

## 31. Local implementation runbook

Build the application in small vertical slices. The agent workflows use LangGraph.js with a PostgreSQL checkpointer; the steps below define the expected sequence. Exact package commands and code signatures must be validated against the versions locked in `package-lock.json`.

### 31.1 Prerequisites

- A maintained Node.js LTS release and npm.
- PostgreSQL locally or a managed PostgreSQL database.
- Git and an editor.
- An OpenAI API key with API billing enabled and access to a model ID confirmed in the API project.
- Optional later: Redis for BullMQ workers, an email provider for notifications, and a private object-storage bucket for production files.

### 31.2 First working slice

1. Create the monorepo directories from Section 14 and initialize TypeScript in the frontend and backend.
2. Create a PostgreSQL database and configure `DATABASE_URL` in a local `.env` file.
3. Add Prisma schema and migrations for users, candidate profiles, profile facts, search preferences, job sources, jobs, job matches, documents, applications, application events, and audit events.
4. Build the first authenticated UI: Dashboard, Candidate Profile, Resource Library, and Jobs.
5. Add `/api/v1/health` and profile CRUD routes with request validation and authentication.
6. Add the OpenAI service abstraction and a health/configuration check that does not print the API key.
7. Initialize the LangGraph PostgreSQL checkpointer and implement one small discovery graph with a server-generated `thread_id`; test pause/resume in development before adding more nodes.
8. Implement manual job URL import and one official ATS adapter before adding more platforms.
9. Add normalization, canonical URLs, hashing, deduplication, and visible source outcomes.
10. Add job-matching rules and the track switcher for Software/IT, Core EEE, and Business/Data Analyst.
11. Add resume draft → evidence validation → diff preview → DOCX/PDF export → user approval.
12. Add application tracking and require explicit user confirmation before marking a submission as applied.
13. Add hiring-team research and outreach drafts, with manual LinkedIn actions.
14. Add Agent Runner, background workers, source retries, cancellation, cost estimates, and notifications.
15. Add deployment, backups, monitoring, export/delete controls, and a production security review.

### 31.3 Expected root scripts

Create and document scripts equivalent to the following (names may vary):

- `dev`: run frontend and backend in development.
- `build`: type-check and build all packages.
- `lint`: run the configured linter.
- `test`: run unit and API tests.
- `test:e2e`: run Playwright smoke/regression tests.
- `db:migrate`: apply Prisma migrations.
- `db:seed`: create local development fixtures clearly marked as fake/demo data.
- `worker:dev`: start the queue worker once Redis/BullMQ is implemented.

Do not ship demo listings as real job opportunities. Mark every fixture and test run as `demo`/`mock` in the UI and database.

### 31.4 Environment configuration

Extend the `.env.example` from Section 15 with optional budget and service controls:

```dotenv
# OpenAI (server only)
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_MODEL_FAST=
OPENAI_MODEL_QUALITY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
LANGGRAPH_CHECKPOINT_DATABASE_URL=

# Cost controls (illustrative defaults; choose values before running live searches)
AI_DAILY_BUDGET_USD=0.50
AI_MONTHLY_BUDGET_USD=10.00
AI_RUN_BUDGET_USD=0.25
AI_MAX_CALLS_PER_RUN=100

# Optional services
REDIS_URL=redis://localhost:6379
PRIVATE_FILES_DIR=./private-files
```

The values above are example guardrails for development, not forecasts of total operating cost or provider pricing. Web-search costs and model-token costs must be included in preflight and actual usage calculations. If a configured model is unavailable, fail visibly with a setup error rather than silently switching to an unconfigured model.

## 32. Explicit assumptions, limits, and non-goals

- This is an original implementation inspired by a public product workflow, not a copy of Tsenta's proprietary code, private data, or branding.
- It cannot guarantee a job offer, interview, exact market coverage, or an exhaustive list of vacancies.
- Each source connector is responsible for recording its data source, last successful sync, allowed access mode, rate limits, and failure state.
- Company names and hiring-team names from uploaded material are leads to verify, not proof that a vacancy or current employment relationship exists.
- Uploaded files are untrusted data. Do not execute macros, scripts, embedded actions, spreadsheet formulas, or prompt instructions found inside them.
- Do not bypass CAPTCHA, MFA, authentication, paywalls, or anti-bot controls. Do not use unauthorized scraping or browser automation for LinkedIn connection requests or messages.
- The initial application workflow prepares the materials and opens official application pages; the candidate confirms submission. Automated submission may be added only for integrations that explicitly permit it and require suitable credentials/authorization.
- Do not automatically provide sensitive identity, financial, or legal information, accept service agreements, pay application fees, make salary commitments, or answer legal attestations without user review.
- Only facts explicitly confirmed by the candidate can be marked as verified. Resume tailoring changes presentation and relevance, not the truth of the underlying experience.

## 33. Primary external references

Verify current provider documentation, terms, authentication requirements, prices, and model availability before coding or deploying connectors. These references are entry points, not a claim that every integration is approved for every use case.

- OpenAI model catalogue: https://platform.openai.com/docs/models
- OpenAI API pricing: https://platform.openai.com/pricing
- OpenAI Responses API web-search guide: https://developers.openai.com/api/docs/guides/tools-web-search
- LangGraph.js overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph.js human-in-the-loop: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/agents/human-in-the-loop.md
- LangGraph.js persistence: https://github.com/langchain-ai/langgraphjs/blob/main/docs/docs/concepts/persistence.md
- LangGraph PostgreSQL checkpointer package: https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-postgres
- Greenhouse Job Board API documentation: https://docs.greenhouse.io/job-board.html
- Lever postings API: https://github.com/lever/postings-api
- LinkedIn User Agreement: https://www.linkedin.com/legal/user-agreement
- LinkedIn Professional Community Policies: https://www.linkedin.com/legal/professional-community-policies

**Recommended MVP boundary:** deliver authenticated profile management, Resource Library import and validation, two or three permitted job-source connectors, the persistent Agent Runner, transparent track-specific matching, and a reviewed resume/application packet before adding advanced outreach or more integrations. The first version should be safe, auditable, and useful even if only a subset of connectors is configured.
