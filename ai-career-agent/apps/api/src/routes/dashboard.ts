import { Router, Request, Response, NextFunction } from 'express';
import { ApplicationStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// ─── GET /dashboard/summary ───────────────────────────────────────────────────

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const now = new Date();

    const [
      highFitMatches,
      pendingApplications,
      dueFollowUps,
      totalJobsDiscovered,
      totalProfileFacts,
      latestRun,
    ] = await Promise.all([
      // High-fit job matches (score >= 70)
      prisma.jobMatch.findMany({
        where: { userId, score: { gte: 70 } },
        orderBy: { score: 'desc' },
        take: 5,
        include: { job: true },
      }),

      // Applications in review or ready
      prisma.application.count({
        where: {
          userId,
          status: { in: [ApplicationStatus.READY_FOR_REVIEW, ApplicationStatus.APPLICATION_OPENED] },
        },
      }),

      // Follow-ups due
      prisma.application.findMany({
        where: {
          userId,
          nextFollowUpAt: { lte: now },
          status: ApplicationStatus.APPLIED,
        },
        take: 5,
        include: { job: true },
      }),

      // Total jobs in DB
      prisma.job.count({ where: { isActive: true } }),

      // Verified facts count
      prisma.profileFact.count({ where: { userId, verifiedByUser: true } }),

      // Latest Agent Run
      prisma.agentRun.findFirst({
        where: { ownerId: userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.status(200).json({
      summary: {
        totalJobsDiscovered,
        verifiedFactsCount: totalProfileFacts,
        pendingApplicationsCount: pendingApplications,
        dueFollowUpsCount: dueFollowUps.length,
        latestRunStatus: latestRun?.status ?? 'No runs yet',
      },
      topMatches: highFitMatches.map((m) => ({
        jobId: m.jobId,
        title: m.job.title,
        company: m.job.company,
        score: m.score,
        track: m.track,
        location: m.job.locationText,
        applyUrl: m.job.applyUrl,
      })),
      dueFollowUps: dueFollowUps.map((a) => ({
        applicationId: a.id,
        company: a.job.company,
        title: a.job.title,
        nextFollowUpAt: a.nextFollowUpAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /dashboard/funnel ────────────────────────────────────────────────────

router.get('/funnel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const counts = await prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    const funnel: Record<string, number> = {};
    for (const c of counts) {
      funnel[c.status] = c._count.status;
    }

    res.status(200).json({ funnel });
  } catch (err) {
    next(err);
  }
});

export default router;
