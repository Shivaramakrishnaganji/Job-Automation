import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ContactType, OutreachStatus, ApprovalStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { draftOutreach } from '../services/ai/openai.service';

const router = Router();
router.use(requireAuth);

// ─── GET /contacts ────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const contacts = await prisma.contact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        outreachDrafts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    res.status(200).json({ contacts });
  } catch (err) {
    next(err);
  }
});

// ─── POST /contacts ───────────────────────────────────────────────────────────

const createContactSchema = z.object({
  companyName: z.string().min(1),
  name: z.string().optional(),
  roleTitle: z.string().optional(),
  contactType: z.nativeEnum(ContactType).default(ContactType.TALENT_ACQUISITION),
  profileUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  sourceName: z.string().optional(),
  relevanceReason: z.string().optional(),
  jobId: z.string().uuid().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const contact = await prisma.contact.create({
      data: {
        userId,
        ...parsed.data,
      },
    });

    await logAudit({
      userId,
      action: 'CONTACT_CREATE',
      entityType: 'Contact',
      entityId: contact.id,
      metadata: { companyName: contact.companyName, name: contact.name },
    });

    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
});

// ─── POST /contacts/:contactId/draft-outreach ─────────────────────────────────

router.post('/:contactId/draft-outreach', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { contactId } = req.params;

    const [contact, facts, profile] = await Promise.all([
      prisma.contact.findUnique({ where: { id: contactId } }),
      prisma.profileFact.findMany({ where: { userId } }),
      prisma.candidateProfile.findUnique({ where: { userId } }),
    ]);

    if (!contact || contact.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Contact not found' });
      return;
    }

    let noteText = '';
    let evidenceIds: string[] = [];
    let resAiSuccess = false;

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'mock' && !process.env.OPENAI_API_KEY.includes('mock')) {
      try {
        const resAI = await draftOutreach(
          facts,
          { company: contact.companyName, role: contact.roleTitle },
          contact.sourceUrl || 'Public Recruiter Profile',
          userId
        );
        noteText = resAI.note;
        evidenceIds = resAI.evidenceFactIds;
        resAiSuccess = true;
      } catch {
        noteText = '';
      }
    }

    if (!noteText) {
      noteText = `Hi ${contact.name || 'there'}, I noticed your work at ${contact.companyName}. As a ${profile?.degree || 'B.Tech'} student graduating in ${profile?.graduationYear || '2027'} with hands-on full-stack projects, I would love to connect and follow your team's updates.`;
      evidenceIds = facts.slice(0, 2).map((f) => f.id);
    }

    const isAi = !!resAiSuccess;
    const draft = await prisma.outreachDraft.create({
      data: {
        userId,
        contactId,
        channel: 'LinkedIn',
        draftType: isAi ? 'Connection Note (OpenAI)' : 'Connection Note (Template Fallback)',
        bodyText: noteText,
        evidenceFactIdsJson: evidenceIds,
        approvalStatus: ApprovalStatus.DRAFT,
      },
    });

    // Update contact status to DRAFT_READY
    await prisma.contact.update({
      where: { id: contactId },
      data: { outreachStatus: OutreachStatus.DRAFT_READY },
    });

    res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
});

// ─── POST /contacts/drafts/:draftId/approve ───────────────────────────────────

router.post('/drafts/:draftId/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { draftId } = req.params;

    const draft = await prisma.outreachDraft.findUnique({ where: { id: draftId } });
    if (!draft || draft.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Draft not found' });
      return;
    }

    const updated = await prisma.outreachDraft.update({
      where: { id: draftId },
      data: { approvalStatus: ApprovalStatus.APPROVED },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /contacts/drafts/:draftId/mark-sent ─────────────────────────────────

router.post('/drafts/:draftId/mark-sent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { draftId } = req.params;

    const draft = await prisma.outreachDraft.findUnique({
      where: { id: draftId },
      include: { contact: true },
    });

    if (!draft || draft.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Draft not found' });
      return;
    }

    const now = new Date();
    // Next reminder in 7 business days
    const nextFollowUpAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await Promise.all([
      prisma.outreachDraft.update({
        where: { id: draftId },
        data: { sentByUserAt: now },
      }),
      prisma.contact.update({
        where: { id: draft.contactId },
        data: {
          outreachStatus: OutreachStatus.USER_SENT,
          lastContactedAt: now,
          nextFollowUpAt,
        },
      }),
    ]);

    await logAudit({
      userId,
      action: 'OUTREACH_MARKED_SENT',
      entityType: 'OutreachDraft',
      entityId: draftId,
    });

    res.status(200).json({
      message: 'Outreach recorded as manually sent. Follow-up reminder set.',
      nextFollowUpAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
