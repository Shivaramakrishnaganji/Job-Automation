import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { ProfileFact, ProfileFactCategory } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { resumeUpload, getUserUploadDir } from '../services/files/storage';

const router = Router();

// All profile routes require authentication
router.use(requireAuth);

// ─── Validation schemas ────────────────────────────────────────────────────────

const profileUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  degree: z.string().optional(),
  branch: z.string().optional(),
  graduationYear: z.number().int().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
});

const factCreateSchema = z.object({
  category: z.nativeEnum(ProfileFactCategory),
  label: z.string().min(1),
  valueJson: z.unknown(),
  sourceType: z.string().min(1),
  sourceRef: z.string().optional(),
});

const factUpdateSchema = z.object({
  label: z.string().min(1).optional(),
  valueJson: z.unknown().optional(),
  verifiedByUser: z.boolean().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

// ─── GET /profile ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const profile = await prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      res.status(404).json({ error: 'Not found', message: 'No profile found. Please create one.' });
      return;
    }

    const factsCount = await prisma.profileFact.count({ where: { userId } });

    res.status(200).json({ ...profile, factsCount });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /profile ──────────────────────────────────────────────────────────────

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    // For upsert we need fullName and email at creation time; fall back to existing or provided
    const existing = await prisma.candidateProfile.findUnique({ where: { userId } });

    if (!existing && (!data.fullName || !data.email)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'fullName and email are required when creating a profile for the first time.',
      });
      return;
    }

    const profile = await prisma.candidateProfile.upsert({
      where: { userId },
      update: { ...data },
      create: {
        userId,
        fullName: data.fullName ?? '',
        email: data.email ?? '',
        phone: data.phone,
        city: data.city,
        country: data.country,
        degree: data.degree,
        branch: data.branch,
        graduationYear: data.graduationYear,
        headline: data.headline,
        summary: data.summary,
      },
    });

    await logAudit({
      userId,
      action: 'PROFILE_UPSERT',
      entityType: 'CandidateProfile',
      entityId: profile.id,
    });

    res.status(200).json(profile);
  } catch (err) {
    next(err);
  }
});

// ─── GET /profile/facts ────────────────────────────────────────────────────────

router.get('/facts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const categoryParam = req.query.category as string | undefined;

    const where: { userId: string; category?: ProfileFactCategory } = { userId };
    if (categoryParam) {
      const categoryValues = Object.values(ProfileFactCategory) as string[];
      if (!categoryValues.includes(categoryParam)) {
        res.status(400).json({ error: 'Validation error', message: `Invalid category: ${categoryParam}` });
        return;
      }
      where.category = categoryParam as ProfileFactCategory;
    }

    const facts = await prisma.profileFact.findMany({
      where,
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        category: true,
        label: true,
        valueJson: true,
        sourceType: true,
        sourceRef: true,
        verifiedByUser: true,
        createdAt: true,
      },
    });

    res.status(200).json(facts);
  } catch (err) {
    next(err);
  }
});

// ─── POST /profile/facts ───────────────────────────────────────────────────────

router.post('/facts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const parsed = factCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { category, label, valueJson, sourceType, sourceRef } = parsed.data;

    const fact = await prisma.profileFact.create({
      data: {
        userId,
        category,
        label,
        valueJson: valueJson as any,
        sourceType,
        sourceRef,
        verifiedByUser: false,
      },
    });

    await logAudit({
      userId,
      action: 'FACT_CREATE',
      entityType: 'ProfileFact',
      entityId: fact.id,
      metadata: { category, label },
    });

    res.status(201).json(fact);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /profile/facts/:factId ─────────────────────────────────────────────

router.patch('/facts/:factId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { factId } = req.params;

    const existing = await prisma.profileFact.findUnique({ where: { id: factId } });
    if (!existing) {
      res.status(404).json({ error: 'Not found', message: 'Fact not found.' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to modify this fact.' });
      return;
    }

    const parsed = factUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { label, valueJson, verifiedByUser, validFrom, validUntil } = parsed.data;

    const updated = await prisma.profileFact.update({
      where: { id: factId },
      data: {
        ...(label !== undefined && { label }),
        ...(valueJson !== undefined && { valueJson: valueJson as any }),
        ...(verifiedByUser !== undefined && { verifiedByUser }),
        ...(validFrom !== undefined && { validFrom: new Date(validFrom) }),
        ...(validUntil !== undefined && { validUntil: new Date(validUntil) }),
      },
    });

    await logAudit({
      userId,
      action: 'FACT_UPDATE',
      entityType: 'ProfileFact',
      entityId: factId,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /profile/facts/:factId ────────────────────────────────────────────

router.delete('/facts/:factId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { factId } = req.params;

    const existing = await prisma.profileFact.findUnique({ where: { id: factId } });
    if (!existing) {
      res.status(404).json({ error: 'Not found', message: 'Fact not found.' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to delete this fact.' });
      return;
    }

    await prisma.profileFact.delete({ where: { id: factId } });

    await logAudit({
      userId,
      action: 'FACT_DELETE',
      entityType: 'ProfileFact',
      entityId: factId,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /profile/import-resume ──────────────────────────────────────────────

/**
 * Stub fact extractor.
 * In production this would call an AI service to parse structured facts.
 */
async function extractFactsFromText(text: string, userId: string): Promise<ProfileFact[]> {
  const fact = await prisma.profileFact.create({
    data: {
      userId,
      category: 'CANDIDATE_EVIDENCE' as ProfileFactCategory,
      label: 'Resume upload',
      valueJson: { preview: text.slice(0, 500) },
      sourceType: 'resume_upload',
      verifiedByUser: false,
    },
  });
  return [fact];
}

router.post(
  '/import-resume',
  resumeUpload.single('resume'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;

      if (!req.file) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded or file type not allowed (pdf/docx only).' });
        return;
      }

      const { path: filePath, originalname, mimetype, size } = req.file;

      // ── Extract text from uploaded file ──────────────────────────────────────
      let extractedText = '';

      if (mimetype === 'application/pdf') {
        // Dynamic import so the module is optional at startup
        const pdfParse = (await import('pdf-parse')).default;
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } else if (
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      }

      // ── Compute a simple content hash ─────────────────────────────────────────
      const crypto = await import('crypto');
      const fileBuffer = fs.readFileSync(filePath);
      const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // ── Persist ResourceFile record ───────────────────────────────────────────
      const resourceFile = await prisma.resourceFile.create({
        data: {
          userId,
          originalFilename: originalname,
          mimeType: mimetype,
          storagePath: filePath,
          contentHash,
          resourceType: 'CANDIDATE_EVIDENCE',
          processingStatus: 'DONE',
          processedAt: new Date(),
        },
      });

      // ── Extract facts ─────────────────────────────────────────────────────────
      const extractedFacts = await extractFactsFromText(extractedText, userId);

      await logAudit({
        userId,
        action: 'RESUME_IMPORT',
        entityType: 'ResourceFile',
        entityId: resourceFile.id,
        metadata: { originalFilename: originalname, factsExtracted: extractedFacts.length },
      });

      res.status(200).json({
        resourceFileId: resourceFile.id,
        extractedFactsCount: extractedFacts.length,
        message: 'Resume uploaded. Review and confirm extracted facts.',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
