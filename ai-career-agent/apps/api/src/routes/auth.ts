import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';

const router = Router();

// ─── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().optional(),
  track: z.enum(['SOFTWARE_IT', 'CORE_EEE', 'BUSINESS_DATA_ANALYST']).optional(),
  degree: z.string().optional(),
  branch: z.string().optional(),
  graduationYear: z.number().int().optional(),
  city: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /register ────────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { email, password, fullName, track, degree, branch, graduationYear, city } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Conflict', message: 'Email already in use.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const rawName = fullName?.trim() || email.split('@')[0];
    const candidateName = rawName
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const selectedTrack = track ?? 'SOFTWARE_IT';

    const defaultHeadline =
      selectedTrack === 'SOFTWARE_IT'
        ? 'Full-Stack Software Engineer & Systems Developer'
        : selectedTrack === 'CORE_EEE'
        ? 'Electrical & Electronics Engineer (Power & Systems)'
        : 'Business & Data Analyst (Reporting & Insights)';

    const defaultBranch =
      branch ||
      (selectedTrack === 'SOFTWARE_IT'
        ? 'Computer Science & Engineering'
        : selectedTrack === 'CORE_EEE'
        ? 'Electrical & Electronics Engineering'
        : 'Data Analytics & Information Systems');

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        candidateProfile: {
          create: {
            fullName: candidateName,
            email,
            headline: defaultHeadline,
            degree: degree || 'Bachelor of Technology (B.Tech)',
            branch: defaultBranch,
            graduationYear: graduationYear || 2027,
            city: city || 'Hyderabad',
            country: 'India',
          },
        },
      },
    });

    // Populate starter facts tailored to the user's career track
    const starterFactsByTrack: Record<string, Array<{ category: any; label: string; value: any }>> = {
      SOFTWARE_IT: [
        { category: 'EDUCATION', label: 'Degree & University', value: `${degree || 'B.Tech'} in ${defaultBranch} (${graduationYear || 2027})` },
        { category: 'SKILL', label: 'JavaScript / TypeScript & Node.js', value: { level: 'Proficient', years: 2 } },
        { category: 'SKILL', label: 'React & Modern Frontend Development', value: { level: 'Proficient' } },
        { category: 'SKILL', label: 'SQL & Database Architecture', value: { level: 'Intermediate' } },
        { category: 'PROJECT', label: 'Web Application Portfolio Project', value: { liveUrl: 'https://github.com' } },
      ],
      CORE_EEE: [
        { category: 'EDUCATION', label: 'Degree & University', value: `${degree || 'B.Tech'} in ${defaultBranch} (${graduationYear || 2027})` },
        { category: 'SKILL', label: 'Circuit Analysis & Power Systems', value: { level: 'Proficient' } },
        { category: 'SKILL', label: 'MATLAB & Simulink Modeling', value: { level: 'Proficient' } },
        { category: 'SKILL', label: 'Embedded Systems & Microcontrollers', value: { level: 'Intermediate' } },
        { category: 'PROJECT', label: 'Power Grid Transient Simulation', value: { simulationTools: ['MATLAB', 'Simulink'] } },
      ],
      BUSINESS_DATA_ANALYST: [
        { category: 'EDUCATION', label: 'Degree & University', value: `${degree || 'B.Tech'} in ${defaultBranch} (${graduationYear || 2027})` },
        { category: 'SKILL', label: 'SQL Querying & Data Modeling', value: { level: 'Advanced' } },
        { category: 'SKILL', label: 'Python for Data Analysis (Pandas, NumPy)', value: { level: 'Proficient' } },
        { category: 'SKILL', label: 'Business Intelligence & Dashboards (Power BI, Tableau)', value: { level: 'Proficient' } },
        { category: 'PROJECT', label: 'Sales & Operations Analytics Dashboard', value: { tools: ['Power BI', 'SQL'] } },
      ],
    };

    const starterFacts = starterFactsByTrack[selectedTrack] || starterFactsByTrack.SOFTWARE_IT;
    for (const f of starterFacts) {
      await prisma.profileFact.create({
        data: {
          userId: user.id,
          category: f.category,
          label: f.label,
          valueJson: f.value,
          sourceType: 'ONBOARDING_INITIALIZATION',
          verifiedByUser: true,
        },
      });
    }

    req.session.userId = user.id;

    await logAudit({
      userId: user.id,
      action: 'USER_REGISTER',
      entityType: 'User',
      entityId: user.id,
    });

    res.status(201).json({ id: user.id, email: user.email, createdAt: user.createdAt });
  } catch (err) {
    next(err);
  }
});

// ─── POST /login ───────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const INVALID_CREDENTIALS = 'Invalid email or password.';

    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: INVALID_CREDENTIALS });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Unauthorized', message: INVALID_CREDENTIALS });
      return;
    }

    req.session.userId = user.id;

    await logAudit({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
    });

    res.status(200).json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

// ─── POST /logout ──────────────────────────────────────────────────────────────

router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
  const userId = req.session.userId;
  req.session.destroy((err: any) => {
    if (err) {
      return next(err);
    }
    if (userId) {
      logAudit({
        userId,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: userId,
      }).catch(() => {
        // fire-and-forget; don't fail the response on audit errors
      });
    }
    res.status(200).json({ message: 'logged out' });
  });
});

// ─── GET /me ───────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, email: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Not found', message: 'User not found.' });
      return;
    }

    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
