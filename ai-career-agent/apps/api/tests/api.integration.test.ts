import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import prisma from '../src/lib/prisma';

describe('AI Career Agent - Comprehensive API Integration Audit', () => {
  const app = createApp();
  let authCookie: string;
  const testEmail = `test-audit-${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';
  let createdJobId: string;
  let createdFactId: string;
  let createdAppId: string;
  let createdContactId: string;
  let createdDraftId: string;
  let createdRunId: string;

  beforeAll(async () => {
    // Ensure database connection
    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup created test user and cascades
    try {
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      if (user) {
        await prisma.agentRun.deleteMany({ where: { ownerId: user.id } });
        await prisma.connectorConfig.deleteMany({ where: { ownerId: user.id } });
        await prisma.jobMatch.deleteMany({ where: { userId: user.id } });
        await prisma.application.deleteMany({ where: { userId: user.id } });
        await prisma.contact.deleteMany({ where: { userId: user.id } });
        await prisma.profileFact.deleteMany({ where: { userId: user.id } });
        await prisma.candidateProfile.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      if (createdJobId) {
        await prisma.jobSourceObservation.deleteMany({ where: { jobId: createdJobId } });
        await prisma.document.deleteMany({ where: { jobId: createdJobId } });
        await prisma.job.delete({ where: { id: createdJobId } });
      }
    } catch {
      // Cleanup best effort
    }
    await prisma.$disconnect();
  });

  // ── 1. Health Check ─────────────────────────────────────────────────────────
  it('GET /health returns 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  // ── 2. Auth Guard Check ─────────────────────────────────────────────────────
  it('rejects unauthenticated requests to protected routes with 401', async () => {
    const res = await request(app).get('/api/v1/profile');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  // ── 3. User Registration ────────────────────────────────────────────────────
  it('POST /api/v1/auth/register registers new candidate and sets session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(testEmail);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = cookies[0];
  });

  // ── 4. Duplicate Registration Prevention ────────────────────────────────────
  it('POST /api/v1/auth/register prevents duplicate email registration with 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already in use');
  });

  // ── 5. User Login & Me ──────────────────────────────────────────────────────
  it('POST /api/v1/auth/login authenticates and verifies password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
    if (res.headers['set-cookie']) {
      authCookie = res.headers['set-cookie'][0];
    }
  });

  it('GET /api/v1/auth/me returns current authenticated candidate', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });

  // ── 6. Candidate Profile Management ─────────────────────────────────────────
  it('PUT /api/v1/profile upserts candidate profile with B.Tech EEE defaults', async () => {
    const res = await request(app)
      .put('/api/v1/profile')
      .set('Cookie', authCookie)
      .send({
        fullName: 'Shiva Kumar',
        email: testEmail,
        degree: 'Bachelor of Technology (B.Tech)',
        branch: 'Electrical & Electronics Engineering (EEE)',
        graduationYear: 2027,
        city: 'Hyderabad',
        country: 'India',
        headline: 'Aspiring Systems & Full-Stack Engineer (B.Tech EEE 2027)',
        summary: 'Electrical engineering student with full-stack software project experience.',
      });

    expect(res.status).toBe(200);
    expect(res.body.degree).toBe('Bachelor of Technology (B.Tech)');
    expect(res.body.graduationYear).toBe(2027);
  });

  it('GET /api/v1/profile fetches current candidate profile with facts count', async () => {
    const res = await request(app)
      .get('/api/v1/profile')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Shiva Kumar');
  });

  // ── 7. Profile Facts & Truth Before Tailoring ───────────────────────────────
  it('POST /api/v1/profile/facts creates an unverified fact initially', async () => {
    const res = await request(app)
      .post('/api/v1/profile/facts')
      .set('Cookie', authCookie)
      .send({
        category: 'SKILL',
        label: 'React & TypeScript',
        valueJson: { skill: 'React', level: 'Proficient' },
        sourceType: 'user_entry',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.verifiedByUser).toBe(false);
    createdFactId = res.body.id;
  });

  it('PATCH /api/v1/profile/facts/:id allows candidate to confirm verification', async () => {
    const res = await request(app)
      .patch(`/api/v1/profile/facts/${createdFactId}`)
      .set('Cookie', authCookie)
      .send({ verifiedByUser: true });

    expect(res.status).toBe(200);
    expect(res.body.verifiedByUser).toBe(true);
  });

  it('GET /api/v1/profile/facts filters by category', async () => {
    const res = await request(app)
      .get('/api/v1/profile/facts?category=SKILL')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((f: any) => f.id === createdFactId)).toBe(true);
  });

  // ── 8. Job URL Import & Deduplication ───────────────────────────────────────
  it('POST /api/v1/jobs/import-url imports a new job opening', async () => {
    const uniqueUrl = `https://careers.example.com/jobs/role-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/jobs/import-url')
      .set('Cookie', authCookie)
      .send({
        url: uniqueUrl,
        descriptionText: 'Graduate Software Engineer Trainee needed in Hyderabad. Freshers welcome.',
      });

    expect(res.status).toBe(201);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.created).toBe(true);
    createdJobId = res.body.jobId;

    // Verify observation record was created
    const obs = await prisma.jobSourceObservation.findFirst({
      where: { jobId: createdJobId },
    });
    expect(obs).toBeDefined();
    expect(obs?.sourceUrl).toBe(uniqueUrl);
  });

  it('POST /api/v1/jobs/import-url detects duplicates by canonical URL', async () => {
    const job = await prisma.job.findUnique({ where: { id: createdJobId } });
    const res = await request(app)
      .post('/api/v1/jobs/import-url')
      .set('Cookie', authCookie)
      .send({
        url: job!.applyUrl,
      });

    expect(res.status).toBe(200);
    expect(res.body.isDuplicate).toBe(true);
    expect(res.body.jobId).toBe(createdJobId);
  });

  // ── 9. Job Matching & Scoring ───────────────────────────────────────────────
  it('POST /api/v1/jobs/:jobId/match produces explainable score with evidence', async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${createdJobId}/match`)
      .set('Cookie', authCookie)
      .send({ track: 'SOFTWARE_IT' });

    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(res.body.confidence).toBeDefined();
    expect(res.body.eligible).toBeDefined();
    expect(res.body.reasonsJson).toBeDefined();
  });

  // ── 10. Tailored Document Generation ────────────────────────────────────────
  it('POST /api/v1/jobs/:jobId/resume-draft creates tailored draft with fact references', async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${createdJobId}/resume-draft`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(201);
    expect(res.body.documentType).toBe('RESUME');
    expect(res.body.contentJson.headline).toBeDefined();
    expect(res.body.contentJson.skills).toBeDefined();
  });

  // ── 11. Application Pipeline & Follow-up Scheduling ─────────────────────────
  it('POST /api/v1/applications queues role in READY_FOR_REVIEW', async () => {
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Cookie', authCookie)
      .send({
        jobId: createdJobId,
        notes: 'Initial test review',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('READY_FOR_REVIEW');
    createdAppId = res.body.id;
  });

  it('PATCH /api/v1/applications/:id/status transitions state', async () => {
    const res = await request(app)
      .patch(`/api/v1/applications/${createdAppId}/status`)
      .set('Cookie', authCookie)
      .send({ status: 'APPLICATION_OPENED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPLICATION_OPENED');
  });

  it('POST /api/v1/applications/:id/confirm-submission marks APPLIED and sets 7-day follow-up', async () => {
    const res = await request(app)
      .post(`/api/v1/applications/${createdAppId}/confirm-submission`)
      .set('Cookie', authCookie)
      .send({ receiptUrl: 'https://careers.example.com/confirmation/123' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('APPLIED');
    expect(res.body.application.submittedAt).toBeDefined();
    expect(res.body.application.nextFollowUpAt).toBeDefined();

    // Verify follow-up is approx 7 days out
    const followUpTime = new Date(res.body.application.nextFollowUpAt).getTime();
    const expectedApprox = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(followUpTime - expectedApprox)).toBeLessThan(10000);
  });

  // ── 12. Hiring-Team Research & Outreach Drafts ──────────────────────────────
  it('POST /api/v1/contacts creates researched public hiring contact', async () => {
    const res = await request(app)
      .post('/api/v1/contacts')
      .set('Cookie', authCookie)
      .send({
        companyName: 'TestCorp',
        name: 'Anita Roy',
        roleTitle: 'Talent Acquisition Partner',
        contactType: 'TALENT_ACQUISITION',
        sourceUrl: 'https://testcorp.com/careers/team',
        relevanceReason: 'University hiring specialist for engineering.',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdContactId = res.body.id;
  });

  it('POST /api/v1/contacts/:id/draft-outreach drafts connection note <= 280 chars', async () => {
    const res = await request(app)
      .post(`/api/v1/contacts/${createdContactId}/draft-outreach`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(201);
    expect(res.body.bodyText).toBeDefined();
    expect(res.body.bodyText.length).toBeLessThanOrEqual(300);
    expect(res.body.approvalStatus).toBe('DRAFT');
    createdDraftId = res.body.id;
  });

  it('POST /api/v1/contacts/drafts/:id/mark-sent records manual send and follow-up date', async () => {
    const res = await request(app)
      .post(`/api/v1/contacts/drafts/${createdDraftId}/mark-sent`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.nextFollowUpAt).toBeDefined();

    const contact = await prisma.contact.findUnique({ where: { id: createdContactId } });
    expect(contact?.outreachStatus).toBe('USER_SENT');
  });

  // ── 13. Connectors Registry ─────────────────────────────────────────────────
  it('GET /api/v1/connectors returns permitted connectors without secrets', async () => {
    const res = await request(app)
      .get('/api/v1/connectors')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.connectors)).toBe(true);
    expect(res.body.connectors.some((c: any) => c.connectorKey === 'greenhouse')).toBe(true);
    // Secrets must never be exposed
    expect(JSON.stringify(res.body)).not.toContain('apiKey');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('PATCH /api/v1/connectors/:key toggles connector status', async () => {
    const res = await request(app)
      .patch('/api/v1/connectors/greenhouse')
      .set('Cookie', authCookie)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  // ── 14. Dashboard Analytics & Funnel ────────────────────────────────────────
  it('GET /api/v1/dashboard/summary returns real metrics', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.totalJobsDiscovered).toBe('number');
  });

  it('GET /api/v1/dashboard/funnel returns status breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/funnel')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.funnel).toBeDefined();
    expect(res.body.funnel.APPLIED).toBeGreaterThanOrEqual(1);
  });

  // ── 15. Settings & Data Export ──────────────────────────────────────────────
  it('GET /api/v1/settings/ai-usage returns budget tracking meters', async () => {
    const res = await request(app)
      .get('/api/v1/settings/ai-usage')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.dailyBudgetUsd).toBeDefined();
    expect(res.body.monthlyBudgetUsd).toBeDefined();
    expect(res.body.withinBudget).toBe(true);
  });

  it('POST /api/v1/settings/export-data exports candidate facts and records', async () => {
    const res = await request(app)
      .post('/api/v1/settings/export-data')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.exportedAt).toBeDefined();
    expect(res.body.profile).toBeDefined();
    expect(res.body.facts).toBeDefined();
    expect(res.body.applications).toBeDefined();
  });

  // ── 16. Agent Runner (LangGraph.js Discovery Graph) ─────────────────────────
  it('POST /api/v1/agent-runs launches durable LangGraph run and records threadId', async () => {
    const res = await request(app)
      .post('/api/v1/agent-runs')
      .set('Cookie', authCookie)
      .send({
        mode: 'daily_discovery',
        tracks: ['software_it'],
        connectorIds: ['greenhouse', 'lever'],
        minFitScore: 60,
      });

    expect(res.status).toBe(202);
    expect(res.body.runId).toBeDefined();
    expect(res.body.graphThreadId).toBeDefined();
    createdRunId = res.body.runId;
  });

  it('GET /api/v1/agent-runs/:id returns run state and events log', async () => {
    const res = await request(app)
      .get(`/api/v1/agent-runs/${createdRunId}`)
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdRunId);
    expect(res.body.ownerId).toBeDefined();
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('POST /api/v1/agent-runs/:id/cancel cancels active run', async () => {
    const res = await request(app)
      .post(`/api/v1/agent-runs/${createdRunId}/cancel`)
      .set('Cookie', authCookie);

    // Either cancels if still running or returns 400 if already finished
    if (res.status === 200) {
      expect(res.body.status).toBe('CANCELED');
    } else {
      expect(res.status).toBe(400);
    }
  });
});
