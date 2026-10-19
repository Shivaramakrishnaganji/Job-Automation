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

    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Conflict', message: 'Email already in use.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });

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
