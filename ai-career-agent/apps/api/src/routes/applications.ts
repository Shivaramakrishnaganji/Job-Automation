import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';

const router = Router();
router.use(requireAuth);

// ─── GET /applications ────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { status } = req.query;

    const where: any = { userId };
    if (status) {
      where.status = status as ApplicationStatus;
    }

    const applications = await prisma.application.findMany({
      where,
      orderBy: { lastUpdatedAt: 'desc' },
      include: {
        job: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    });

    res.status(200).json({ applications });
  } catch (err) {
    next(err);
  }
});

// ─── GET /applications/:applicationId ─────────────────────────────────────────

router.get('/:applicationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { applicationId } = req.params;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!application || application.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Application not found' });
      return;
    }

    res.status(200).json(application);
  } catch (err) {
    next(err);
  }
});

// ─── POST /applications ───────────────────────────────────────────────────────

const createApplicationSchema = z.object({
  jobId: z.string().uuid(),
  notes: z.string().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const parsed = createApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { jobId, notes } = parsed.data;

    // Verify job exists
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ error: 'Not found', message: 'Job not found' });
      return;
    }

    // Check if application already exists for this job
    const existing = await prisma.application.findUnique({
      where: { userId_jobId: { userId, jobId } },
    });

    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const application = await prisma.application.create({
      data: {
        userId,
        jobId,
        status: ApplicationStatus.READY_FOR_REVIEW,
        notes,
      },
    });

    // Record initial event
    await prisma.applicationEvent.create({
      data: {
        applicationId: application.id,
        eventType: 'APPLICATION_CREATED',
        toStatus: ApplicationStatus.READY_FOR_REVIEW,
        detailsJson: { reason: 'User queued job for application preparation.' },
      },
    });

    await logAudit({
      userId,
      action: 'APPLICATION_CREATE',
      entityType: 'Application',
      entityId: application.id,
      metadata: { jobId },
    });

    res.status(201).json(application);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /applications/:applicationId/status ────────────────────────────────

const updateStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  notes: z.string().optional(),
});

router.patch('/:applicationId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { applicationId } = req.params;

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application || application.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Application not found' });
      return;
    }

    const fromStatus = application.status;
    const toStatus = parsed.data.status;

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: toStatus,
        notes: parsed.data.notes ?? application.notes,
        lastUpdatedAt: new Date(),
      },
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'STATUS_CHANGE',
        fromStatus,
        toStatus,
        detailsJson: { notes: parsed.data.notes },
      },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /applications/:applicationId/confirm-submission ─────────────────────

const confirmSubmissionSchema = z.object({
  notes: z.string().optional(),
  receiptUrl: z.string().url().optional(),
});

router.post('/:applicationId/confirm-submission', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { applicationId } = req.params;

    const parsed = confirmSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application || application.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Application not found' });
      return;
    }

    const now = new Date();
    // Default follow up reminder: 7 calendar days
    const nextFollowUpAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.APPLIED,
        submittedAt: now,
        lastUpdatedAt: now,
        nextFollowUpAt,
        notes: parsed.data.notes || application.notes,
      },
    });

    await prisma.applicationEvent.create({
      data: {
        applicationId,
        eventType: 'SUBMISSION_CONFIRMED',
        fromStatus: application.status,
        toStatus: ApplicationStatus.APPLIED,
        detailsJson: {
          confirmedAt: now.toISOString(),
          receiptUrl: parsed.data.receiptUrl,
        },
      },
    });

    await logAudit({
      userId,
      action: 'APPLICATION_SUBMISSION_CONFIRMED',
      entityType: 'Application',
      entityId: applicationId,
    });

    res.status(200).json({
      application: updated,
      message: 'Submission confirmed. Follow-up reminder scheduled for 7 days from now.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
