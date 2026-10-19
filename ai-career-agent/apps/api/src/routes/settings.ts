import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { checkBudget } from '../services/ai/usage';
import { logAudit } from '../lib/auditLogger';

const router = Router();
router.use(requireAuth);

// ─── GET /settings/ai-usage ───────────────────────────────────────────────────

router.get('/ai-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const budgetStatus = await checkBudget(userId);

    const recentEvents = await prisma.aiUsageEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.status(200).json({
      model: process.env.OPENAI_MODEL ?? 'gpt-6-luna',
      dailySpentUsd: budgetStatus.dailySpent,
      monthlySpentUsd: budgetStatus.monthlySpent,
      dailyBudgetUsd: parseFloat(process.env.AI_DAILY_BUDGET_USD ?? '0.50'),
      monthlyBudgetUsd: parseFloat(process.env.AI_MONTHLY_BUDGET_USD ?? '10.00'),
      withinBudget: budgetStatus.withinBudget,
      recentOperations: recentEvents,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /settings/preferences ──────────────────────────────────────────────

const prefSchema = z.object({
  name: z.string().optional(),
  targetRoles: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  workModes: z.array(z.string()).optional(),
  minSalary: z.number().optional(),
  fresherOnly: z.boolean().optional(),
  requiredSkills: z.array(z.string()).optional(),
  excludedCompanies: z.array(z.string()).optional(),
});

router.patch('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const parsed = prefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const {
      name = 'Default Preference',
      targetRoles,
      locations,
      workModes,
      minSalary,
      fresherOnly,
      requiredSkills,
      excludedCompanies,
    } = parsed.data;

    const existing = await prisma.searchPreference.findFirst({
      where: { userId, isActive: true },
    });

    let pref;
    if (existing) {
      pref = await prisma.searchPreference.update({
        where: { id: existing.id },
        data: {
          name,
          targetRolesJson: (targetRoles as any) ?? existing.targetRolesJson,
          locationsJson: (locations as any) ?? existing.locationsJson,
          workModesJson: (workModes as any) ?? existing.workModesJson,
          minSalary: minSalary !== undefined ? minSalary : existing.minSalary,
          fresherOnly: fresherOnly !== undefined ? fresherOnly : existing.fresherOnly,
          requiredSkillsJson: (requiredSkills as any) ?? existing.requiredSkillsJson,
          excludedCompaniesJson: (excludedCompanies as any) ?? existing.excludedCompaniesJson,
        },
      });
    } else {
      pref = await prisma.searchPreference.create({
        data: {
          userId,
          name,
          targetRolesJson: (targetRoles as any) ?? [],
          locationsJson: (locations as any) ?? ['Hyderabad, Telangana', 'Remote India'],
          workModesJson: (workModes as any) ?? ['remote', 'hybrid', 'onsite'],
          employmentTypesJson: ['full-time', 'internship'],
          minSalary,
          fresherOnly: fresherOnly ?? true,
          requiredSkillsJson: (requiredSkills as any) ?? [],
          excludedCompaniesJson: (excludedCompanies as any) ?? [],
        },
      });
    }

    res.status(200).json(pref);
  } catch (err) {
    next(err);
  }
});

// ─── POST /settings/export-data ───────────────────────────────────────────────

router.post('/export-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const [profile, facts, applications, documents, contacts] = await Promise.all([
      prisma.candidateProfile.findUnique({ where: { userId } }),
      prisma.profileFact.findMany({ where: { userId } }),
      prisma.application.findMany({ where: { userId }, include: { job: true } }),
      prisma.document.findMany({ where: { userId } }),
      prisma.contact.findMany({ where: { userId } }),
    ]);

    await logAudit({
      userId,
      action: 'DATA_EXPORTED',
      entityType: 'User',
      entityId: userId,
    });

    res.status(200).json({
      exportedAt: new Date().toISOString(),
      profile,
      facts,
      applications,
      documents,
      contacts,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /settings/account-data ────────────────────────────────────────────

router.delete('/account-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    // Perform data cleanup in transaction
    await prisma.$transaction([
      prisma.profileFact.deleteMany({ where: { userId } }),
      prisma.jobMatch.deleteMany({ where: { userId } }),
      prisma.document.deleteMany({ where: { userId } }),
      prisma.application.deleteMany({ where: { userId } }),
      prisma.contact.deleteMany({ where: { userId } }),
      prisma.resourceFile.updateMany({ where: { userId }, data: { isActive: false } }),
      prisma.candidateProfile.deleteMany({ where: { userId } }),
    ]);

    await logAudit({
      userId,
      action: 'ACCOUNT_DATA_WIPED',
      entityType: 'User',
      entityId: userId,
    });

    res.status(200).json({ message: 'All personal candidate data successfully deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
