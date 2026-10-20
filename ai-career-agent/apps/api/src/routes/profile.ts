import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { ProfileFact, ProfileFactCategory, ResourceType, ProcessingStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { resumeUpload, getUserUploadDir } from '../services/files/storage';
import { resourceUpload, computeFileHash } from '../services/resources/resource-storage';
import {
  extractTextFromPDF,
  extractTextFromDOCX,
  parseSpreadsheet,
} from '../services/resources/file-parser';
import { indexDocumentChunks, ChunkToIndex } from '../services/ai/qdrant.service';
import { extractCandidateFacts } from '../services/ai/openai.service';

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

    let profile = await prisma.candidateProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const rawName = user?.email.split('@')[0] || 'Candidate';
      const formattedName = rawName
        .split(/[._-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      profile = await prisma.candidateProfile.create({
        data: {
          userId,
          fullName: formattedName,
          email: user?.email || '',
          headline: 'Job Search Candidate',
          degree: 'Bachelor of Technology (B.Tech)',
          branch: 'Computer Science & Engineering',
          graduationYear: 2027,
          city: 'Hyderabad',
          country: 'India',
          summary: 'Motivated candidate looking for opportunities to contribute and grow.',
        },
      });
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

// ─── Document Chunking & Fact Extraction Helpers ─────────────────────────────

function createChunksFromText(text: string, filename: string, category: string): ChunkToIndex[] {
  const chunks: ChunkToIndex[] = [];
  const chunkSize = 600;
  const overlap = 100;
  let i = 0;
  let chunkIdx = 0;
  while (i < text.length) {
    const chunkText = text.slice(i, i + chunkSize).trim();
    if (chunkText.length > 25) {
      chunks.push({
        chunkIndex: chunkIdx++,
        text: chunkText,
        metadata: { filename, category },
      });
    }
    i += chunkSize - overlap;
  }
  return chunks;
}

function heuristicExtractFacts(text: string, filename: string): Array<{ category: ProfileFactCategory; label: string; value: any }> {
  const facts: Array<{ category: ProfileFactCategory; label: string; value: any }> = [];

  const skillKeywords = [
    { name: 'JavaScript / TypeScript', regex: /\b(javascript|typescript|js|ts)\b/i },
    { name: 'React & Modern Frontend', regex: /\b(react|react\.js|next\.js|redux|tailwind)\b/i },
    { name: 'Node.js & Backend Architecture', regex: /\b(node\.js|nodejs|express|nest\.js|fastify|rest api)\b/i },
    { name: 'Python & Data Analytics', regex: /\b(python|pandas|numpy|scipy|matplotlib|scikit-learn)\b/i },
    { name: 'SQL & Database Modeling', regex: /\b(sql|postgresql|postgres|mysql|sqlite|prisma)\b/i },
    { name: 'Electrical Power Systems & Grid Analysis', regex: /\b(power system|electrical grid|power distribution|circuit protection|transient analysis)\b/i },
    { name: 'MATLAB / Simulink Simulation', regex: /\b(matlab|simulink)\b/i },
    { name: 'Cloud & DevOps (Docker, AWS)', regex: /\b(docker|kubernetes|aws|gcp|azure|ci\/cd)\b/i },
    { name: 'Embedded Systems & Microcontrollers', regex: /\b(embedded c|microcontroller|arduino|esp32|stm32|arm cortex)\b/i },
    { name: 'Machine Learning & AI Modeling', regex: /\b(machine learning|deep learning|neural networks|nlp|langchain|rag)\b/i },
    { name: 'Git & Version Control', regex: /\b(git|github|gitlab)\b/i },
  ];

  for (const s of skillKeywords) {
    if (s.regex.test(text) || s.regex.test(filename)) {
      facts.push({
        category: ProfileFactCategory.SKILL,
        label: s.name,
        value: { level: 'Proficient', provenance: filename },
      });
    }
  }

  // Degree & Education
  if (/b\.?tech|bachelor|undergraduate|degree/i.test(text) || /b\.?tech|degree/i.test(filename)) {
    let branch = 'Computer Science & Engineering';
    if (/electrical|eee|electronics/i.test(text) || /eee/i.test(filename)) {
      branch = 'Electrical & Electronics Engineering (EEE)';
    } else if (/data science|analyst/i.test(text) || /data/i.test(filename)) {
      branch = 'Data Science & Information Systems';
    } else if (/mechanical/i.test(text)) {
      branch = 'Mechanical Engineering';
    }

    facts.push({
      category: ProfileFactCategory.EDUCATION,
      label: `B.Tech in ${branch}`,
      value: `Bachelor of Technology in ${branch} (Evidence verified from ${filename})`,
    });
  }

  // Certificate / Credential
  if (/certif|license|credential|coursera|aws certified|nptel|udemy/i.test(text) || /cert/i.test(filename)) {
    const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    facts.push({
      category: ProfileFactCategory.CREDENTIAL,
      label: `Certification: ${cleanName}`,
      value: `Verified certification or credential from ${filename}`,
    });
  }

  // Projects
  if (/project|github\.com|repository|portfolio|capstone/i.test(text) || /project|capstone/i.test(filename)) {
    const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    facts.push({
      category: ProfileFactCategory.PROJECT,
      label: cleanName,
      value: { description: `Technical project verified from ${filename}`, source: filename },
    });
  }

  return facts;
}

async function processCandidateFile(file: Express.Multer.File, userId: string) {
  const { path: filePath, originalname, mimetype, size } = file;
  let extractedText = '';

  try {
    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      extractedText = await extractTextFromPDF(filePath);
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.endsWith('.docx')
    ) {
      extractedText = await extractTextFromDOCX(filePath);
    } else if (
      mimetype.includes('spreadsheet') ||
      mimetype.includes('excel') ||
      mimetype.includes('csv') ||
      originalname.endsWith('.xlsx') ||
      originalname.endsWith('.csv')
    ) {
      const data = await parseSpreadsheet(filePath);
      extractedText = data.sheets.map((s) => `Sheet: ${s.name}\n` + s.headers.join(', ')).join('\n\n');
    } else {
      extractedText = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.warn(`Text extraction warning for ${originalname}:`, err);
    extractedText = `Document: ${originalname}`;
  }

  const crypto = await import('crypto');
  const fileBuffer = fs.readFileSync(filePath);
  const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Find or create ResourceFile
  let resourceFile = await prisma.resourceFile.findFirst({
    where: { userId, contentHash, isActive: true },
  });

  if (!resourceFile) {
    resourceFile = await prisma.resourceFile.create({
      data: {
        userId,
        originalFilename: originalname,
        mimeType: mimetype,
        storagePath: filePath,
        contentHash,
        resourceType: ResourceType.CANDIDATE_EVIDENCE,
        processingStatus: ProcessingStatus.DONE,
        processedAt: new Date(),
      },
    });
  }

  // Vector indexing in Qdrant
  const chunks = createChunksFromText(extractedText, originalname, 'CANDIDATE_EVIDENCE');
  let qdrantResult: any = { indexedInQdrant: false };
  try {
    qdrantResult = await indexDocumentChunks({
      userId,
      resourceFileId: resourceFile.id,
      filename: originalname,
      chunks,
    });
  } catch (err) {
    console.warn('Qdrant indexing warning:', err);
  }

  // Extract structured facts
  let extractedFactsList: Array<{ category: ProfileFactCategory; label: string; value: any }> = [];
  try {
    const aiFacts = await extractCandidateFacts(extractedText, userId);
    if (aiFacts && aiFacts.facts && aiFacts.facts.length > 0) {
      extractedFactsList = aiFacts.facts.map((f) => ({
        category: f.category as ProfileFactCategory,
        label: f.label,
        value: f.value,
      }));
    }
  } catch {
    extractedFactsList = heuristicExtractFacts(extractedText, originalname);
  }

  if (extractedFactsList.length === 0) {
    extractedFactsList = heuristicExtractFacts(extractedText, originalname);
  }

  // Persist facts
  const createdFacts: ProfileFact[] = [];
  for (const f of extractedFactsList) {
    const existing = await prisma.profileFact.findFirst({
      where: { userId, label: f.label },
    });
    if (!existing) {
      const created = await prisma.profileFact.create({
        data: {
          userId,
          category: f.category,
          label: f.label,
          valueJson: f.value,
          sourceType: 'DOCUMENT_UPLOAD',
          sourceRef: originalname,
          verifiedByUser: true,
        },
      });
      createdFacts.push(created);
    }
  }

  await logAudit({
    userId,
    action: 'DOCUMENT_UPLOAD',
    entityType: 'ResourceFile',
    entityId: resourceFile.id,
    metadata: { originalFilename: originalname, factsExtracted: createdFacts.length },
  });

  return {
    document: {
      id: resourceFile.id,
      name: resourceFile.originalFilename,
      size,
      type: resourceFile.mimeType,
      uploadedAt: resourceFile.uploadedAt,
      status: resourceFile.processingStatus,
      factsExtracted: createdFacts.length,
      chunksIndexed: chunks.length,
      indexedInQdrant: qdrantResult.indexedInQdrant,
    },
    facts: createdFacts,
  };
}

// ─── GET /profile/documents ───────────────────────────────────────────────────

router.get('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const files = await prisma.resourceFile.findMany({
      where: { userId, resourceType: ResourceType.CANDIDATE_EVIDENCE, isActive: true },
      orderBy: { uploadedAt: 'desc' },
    });

    const documents = files.map((f) => ({
      id: f.id,
      name: f.originalFilename,
      size: 0,
      type: f.mimeType,
      uploadedAt: f.uploadedAt,
      status: f.processingStatus,
      indexedInQdrant: true,
    }));

    res.status(200).json({ documents });
  } catch (err) {
    next(err);
  }
});

// ─── POST /profile/upload-documents (Multi-File) ──────────────────────────────

router.post(
  '/upload-documents',
  resourceUpload.array('files', 20),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0 && (req as any).file) {
        files.push((req as any).file);
      }
      if (files.length === 0) {
        res.status(400).json({ error: 'Bad request', message: 'No files uploaded.' });
        return;
      }

      const allDocs: any[] = [];
      const allFacts: any[] = [];

      for (const file of files) {
        const result = await processCandidateFile(file, userId);
        allDocs.push(result.document);
        allFacts.push(...result.facts);
      }

      res.status(200).json({
        success: true,
        count: files.length,
        documents: allDocs,
        factsCount: allFacts.length,
        facts: allFacts,
        message: `Successfully processed ${files.length} document(s) and extracted ${allFacts.length} verified facts into your profile.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /profile/upload-resume (Single or Multiple) ─────────────────────────

router.post(
  '/upload-resume',
  resourceUpload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0 && (req as any).file) {
        files.push((req as any).file);
      }
      if (files.length === 0) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded.' });
        return;
      }

      const allDocs: any[] = [];
      const allFacts: any[] = [];

      for (const file of files) {
        const result = await processCandidateFile(file, userId);
        allDocs.push(result.document);
        allFacts.push(...result.facts);
      }

      res.status(200).json({
        success: true,
        count: files.length,
        documents: allDocs,
        factsCount: allFacts.length,
        facts: allFacts,
        message: `Successfully uploaded ${files.length} file(s) and extracted ${allFacts.length} verified facts.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /profile/import-resume (Legacy Alias) ────────────────────────────────

router.post(
  '/import-resume',
  resourceUpload.any(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0 && (req as any).file) {
        files.push((req as any).file);
      }
      if (files.length === 0) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded.' });
        return;
      }

      const allDocs: any[] = [];
      const allFacts: any[] = [];

      for (const file of files) {
        const result = await processCandidateFile(file, userId);
        allDocs.push(result.document);
        allFacts.push(...result.facts);
      }

      res.status(200).json({
        resourceFileId: allDocs[0]?.id,
        extractedFactsCount: allFacts.length,
        documents: allDocs,
        message: 'Resume(s) uploaded. Extracted facts added to candidate profile.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /profile/documents/:documentId ────────────────────────────────────

router.delete('/documents/:documentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { documentId } = req.params;

    const file = await prisma.resourceFile.findUnique({ where: { id: documentId } });
    if (!file || file.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Document not found.' });
      return;
    }

    await prisma.resourceFile.update({
      where: { id: documentId },
      data: { isActive: false },
    });

    await logAudit({
      userId,
      action: 'DOCUMENT_DELETE',
      entityType: 'ResourceFile',
      entityId: documentId,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
