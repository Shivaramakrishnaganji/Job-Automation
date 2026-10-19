import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MatchTrack, WorkplaceType, JobVerificationStatus, DocumentType } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { applyHardFilters, calculateDeterministicScore } from '../services/matching/matcher';
import { scoreJobMatch, tailorResume, draftCoverLetter, extractJobDetails } from '../services/ai/openai.service';

const router = Router();
router.use(requireAuth);

// ─── GET /jobs ────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const {
      search,
      location,
      minScore,
      track,
      status,
      limit = '25',
      offset = '0',
    } = req.query;

    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 25));
    const parsedOffset = Math.max(0, parseInt(offset as string, 10) || 0);

    const where: any = { isActive: true };

    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { company: { contains: String(search), mode: 'insensitive' } },
        { descriptionText: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    if (location) {
      where.locationText = { contains: String(location), mode: 'insensitive' };
    }

    if (status) {
      where.verificationStatus = String(status) as JobVerificationStatus;
    }

    // Fetch jobs
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        take: parsedLimit,
        skip: parsedOffset,
        orderBy: { firstSeenAt: 'desc' },
        include: {
          jobMatches: {
            where: {
              userId,
              ...(track ? { track: track as MatchTrack } : {}),
            },
          },
          applications: {
            where: { userId },
            select: { id: true, status: true },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Format output with match info
    let formatted = jobs.map((j) => {
      const match = j.jobMatches[0] || null;
      const application = j.applications[0] || null;
      return {
        id: j.id,
        company: j.company,
        title: j.title,
        locationText: j.locationText,
        workplaceType: j.workplaceType,
        employmentType: j.employmentType,
        applyUrl: j.applyUrl,
        firstSeenAt: j.firstSeenAt,
        verificationStatus: j.verificationStatus,
        match: match
          ? {
              score: match.score,
              confidence: match.confidence,
              eligible: match.eligible,
              track: match.track,
              reasons: match.reasonsJson,
              gaps: match.gapsJson,
            }
          : null,
        applicationStatus: application ? application.status : null,
      };
    });

    if (minScore) {
      const min = parseInt(minScore as string, 10);
      formatted = formatted.filter((j) => j.match && j.match.score >= min);
    }

    res.status(200).json({
      jobs: formatted,
      total,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /jobs/:jobId ─────────────────────────────────────────────────────────

router.get('/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        jobMatches: { where: { userId } },
        observations: true,
        applications: { where: { userId } },
      },
    });

    if (!job) {
      res.status(404).json({ error: 'Not found', message: 'Job not found' });
      return;
    }

    res.status(200).json(job);
  } catch (err) {
    next(err);
  }
});

// ─── POST /jobs/import-url ────────────────────────────────────────────────────

const importUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
  descriptionText: z.string().optional(),
});

router.post('/import-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const parsed = importUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { url, descriptionText } = parsed.data;

    // Deduplication check: does job with this URL exist?
    const existing = await prisma.job.findFirst({
      where: { applyUrl: url },
    });

    if (existing) {
      res.status(200).json({
        jobId: existing.id,
        isDuplicate: true,
        message: 'Job with this application URL already exists in database.',
        job: existing,
      });
      return;
    }

    let company = 'Discovered Opportunity';
    let title = 'Job Opening';
    let workplaceType: WorkplaceType = WorkplaceType.UNKNOWN;
    let extractedDesc = descriptionText || `Discovered from ${url}`;

    // If description provided and OPENAI_API_KEY is configured, extract structured details
    if (descriptionText && process.env.OPENAI_API_KEY) {
      try {
        const extracted = await extractJobDetails(descriptionText, userId);
        title = extracted.title || title;
        company = extracted.company || company;
        if (extracted.workplaceType === 'remote') workplaceType = WorkplaceType.REMOTE;
        else if (extracted.workplaceType === 'hybrid') workplaceType = WorkplaceType.HYBRID;
        else if (extracted.workplaceType === 'onsite') workplaceType = WorkplaceType.ONSITE;
      } catch {
        // Fall back gracefully to provided text
      }
    }

    const job = await prisma.job.create({
      data: {
        company,
        title,
        descriptionText: extractedDesc,
        applyUrl: url,
        jobUrl: url,
        workplaceType,
        verificationStatus: JobVerificationStatus.NEEDS_VERIFICATION,
      },
    });

    // Save source observation
    await prisma.jobSourceObservation.create({
      data: {
        jobId: job.id,
        sourceUrl: url,
        canonicalUrl: url,
        verificationStatus: 'user_imported',
      },
    });

    await logAudit({
      userId,
      action: 'JOB_IMPORT_URL',
      entityType: 'Job',
      entityId: job.id,
      metadata: { url },
    });

    res.status(201).json({
      jobId: job.id,
      created: true,
      job,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /jobs/:jobId/match ──────────────────────────────────────────────────

router.post('/:jobId/match', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { jobId } = req.params;
    const { track = 'SOFTWARE_IT' } = req.body;

    const matchTrack = (track as MatchTrack) || MatchTrack.SOFTWARE_IT;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ error: 'Not found', message: 'Job not found' });
      return;
    }

    const [facts, profile, preferences] = await Promise.all([
      prisma.profileFact.findMany({ where: { userId } }),
      prisma.candidateProfile.findUnique({ where: { userId } }),
      prisma.searchPreference.findFirst({ where: { userId, isActive: true } }),
    ]);

    // 1. Hard eligibility checks
    const hardFilterResult = applyHardFilters(
      job,
      preferences,
      profile?.degree,
      profile?.branch,
      profile?.graduationYear
    );

    let matchResult: any;

    if (hardFilterResult.eligible === 'no') {
      matchResult = {
        score: 0,
        confidence: 'high',
        eligible: 'no',
        matchedEvidence: [],
        gaps: hardFilterResult.reasons,
        reasons: [],
        warnings: hardFilterResult.warnings,
      };
    } else if (process.env.OPENAI_API_KEY) {
      try {
        matchResult = await scoreJobMatch(facts, preferences, job, userId);
      } catch {
        // Fall back to deterministic scoring if AI call fails or budget exceeded
        matchResult = calculateDeterministicScore(job, facts, matchTrack);
      }
    } else {
      matchResult = calculateDeterministicScore(job, facts, matchTrack);
    }

    // Persist to JobMatch table (upsert)
    const jobMatch = await prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: {
        score: matchResult.score,
        confidence: matchResult.confidence,
        eligible: matchResult.eligible,
        matchedEvidenceJson: matchResult.matchedEvidence,
        gapsJson: matchResult.gaps,
        reasonsJson: matchResult.reasons,
        warningsJson: matchResult.warnings,
        track: matchTrack,
      },
      create: {
        userId,
        jobId,
        score: matchResult.score,
        confidence: matchResult.confidence,
        eligible: matchResult.eligible,
        matchedEvidenceJson: matchResult.matchedEvidence,
        gapsJson: matchResult.gaps,
        reasonsJson: matchResult.reasons,
        warningsJson: matchResult.warnings,
        track: matchTrack,
      },
    });

    res.status(200).json(jobMatch);
  } catch (err) {
    next(err);
  }
});

// ─── POST /jobs/:jobId/resume-draft ───────────────────────────────────────────

router.post('/:jobId/resume-draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { jobId } = req.params;

    const [job, facts, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profileFact.findMany({ where: { userId } }),
      prisma.candidateProfile.findUnique({ where: { userId } }),
    ]);

    if (!job) {
      res.status(404).json({ error: 'Not found', message: 'Job not found' });
      return;
    }

    const baseResume = profile?.summary || 'Candidate Profile';
    let draftData: any;
    let generationSource = 'fallback_template';

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock' && !process.env.OPENAI_API_KEY.includes('mock')) {
      try {
        draftData = await tailorResume(facts, baseResume, job, userId);
        generationSource = 'openai';
      } catch {
        // Fall back gracefully to deterministic draft
        draftData = null;
      }
    }

    if (!draftData) {
      // Deterministic draft preview grounded strictly in verified profile facts
      draftData = {
        headline: `${profile?.headline || 'Engineer'} - Tailored for ${job.title} at ${job.company}`,
        summary: `Tailored summary highlighting relevant background for ${job.title}.`,
        skills: facts.filter((f) => f.category === 'SKILL').map((f) => ({
          name: f.label,
          evidenceFactIds: [f.id],
        })),
        experienceBullets: [
          {
            text: 'Prepared tailored experience alignment based on verified profile records.',
            evidenceFactIds: facts.slice(0, 1).map((f) => f.id),
            changedFromBase: true,
          },
        ],
        projectBullets: [],
        missingEvidence: [],
        warnings: ['Draft created using offline template. Add live OpenAI key for deep contextual tailoring.'],
      };
    }

    draftData.generationSource = generationSource;

    // Save as Document
    const document = await prisma.document.create({
      data: {
        userId,
        jobId,
        documentType: DocumentType.RESUME,
        contentJson: draftData as any,
      },
    });

    res.status(201).json(document);
  } catch (err) {
    next(err);
  }
});

// ─── POST /jobs/:jobId/cover-letter-draft ─────────────────────────────────────

router.post('/:jobId/cover-letter-draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { jobId } = req.params;

    const [job, facts, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profileFact.findMany({ where: { userId } }),
      prisma.candidateProfile.findUnique({ where: { userId } }),
    ]);

    if (!job) {
      res.status(404).json({ error: 'Not found', message: 'Job not found' });
      return;
    }

    let letterData: any;
    let generationSource = 'fallback_template';

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock' && !process.env.OPENAI_API_KEY.includes('mock')) {
      try {
        letterData = await draftCoverLetter(facts, profile, job, userId);
        generationSource = 'openai';
      } catch {
        letterData = null;
      }
    }

    if (!letterData) {
      letterData = {
        body: `Dear Hiring Team at ${job.company},\n\nI am writing to express my strong interest in the ${job.title} position. With my background in ${profile?.branch || 'engineering'} and proven skills, I am excited about the opportunity to contribute to your team.\n\nSincerely,\n${profile?.fullName || 'Applicant'}`,
        evidenceFactIds: facts.slice(0, 2).map((f) => f.id),
        warnings: ['Cover letter generated via offline template fallback.'],
      };
    }

    letterData.generationSource = generationSource;

    const document = await prisma.document.create({
      data: {
        userId,
        jobId,
        documentType: DocumentType.COVER_LETTER,
        contentJson: letterData as any,
      },
    });

    res.status(201).json(document);
  } catch (err) {
    next(err);
  }
});

// ─── POST /jobs/:jobId/hide ───────────────────────────────────────────────────

router.post('/:jobId/hide', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { jobId } = req.params;

    await prisma.jobMatch.upsert({
      where: { userId_jobId: { userId, jobId } },
      update: { eligible: 'no', warningsJson: ['Hidden by user'] },
      create: {
        userId,
        jobId,
        score: 0,
        confidence: 'high',
        eligible: 'no',
        matchedEvidenceJson: [],
        gapsJson: ['Hidden by user'],
        reasonsJson: [],
        warningsJson: ['Hidden by user'],
        track: MatchTrack.SOFTWARE_IT,
      },
    });

    res.status(200).json({ message: 'Job marked as hidden' });
  } catch (err) {
    next(err);
  }
});

export default router;
