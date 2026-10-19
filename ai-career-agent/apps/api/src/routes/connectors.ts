import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const DEFAULT_CONNECTORS = [
  {
    connectorKey: 'greenhouse',
    displayName: 'Greenhouse Public Boards',
    category: 'official_ats',
    accessMode: 'public_api',
    authRequirement: 'None (Public JSON API)',
    allowedActions: ['discover', 'fetch_details'],
    enabled: true,
    status: 'active',
    notes: 'Harvests verified open positions from official boards-api.greenhouse.io endpoints.',
  },
  {
    connectorKey: 'lever',
    displayName: 'Lever Public Postings',
    category: 'official_ats',
    accessMode: 'public_api',
    authRequirement: 'None (Public JSON API)',
    allowedActions: ['discover', 'fetch_details'],
    enabled: true,
    status: 'active',
    notes: 'Harvests verified open positions from official api.lever.co endpoints.',
  },
  {
    connectorKey: 'ashby',
    displayName: 'Ashby Public Postings',
    category: 'official_ats',
    accessMode: 'public_api',
    authRequirement: 'None (Public API)',
    allowedActions: ['discover'],
    enabled: false,
    status: 'active',
    notes: 'Public postings endpoint for modern tech startups.',
  },
  {
    connectorKey: 'user_resources',
    displayName: 'Resource Library Ingestion',
    category: 'user_resource',
    accessMode: 'user_supplied',
    authRequirement: 'Uploaded XLSX/CSV/PDF',
    allowedActions: ['discover', 'fetch_details'],
    enabled: true,
    status: 'active',
    notes: 'Parses user spreadsheets, campus drive circulars, and target company lists.',
  },
  {
    connectorKey: 'linkedin_assist',
    displayName: 'LinkedIn Assisted Outreach',
    category: 'professional_network',
    accessMode: 'manual_assisted',
    authRequirement: 'Candidate Manual Browser Action',
    allowedActions: ['draft_outreach'],
    enabled: false,
    status: 'planned',
    notes: 'Prepares grounded connection notes for manual sending. Direct headless scraping is disallowed.',
  },
  {
    connectorKey: 'unstop_campus',
    displayName: 'Unstop Campus & Hiring Challenges',
    category: 'early_career_platform',
    accessMode: 'public_search',
    authRequirement: 'None / User Session',
    allowedActions: ['discover'],
    enabled: false,
    status: 'planned',
    notes: 'College hiring and engineering challenges for Indian freshers.',
  },
];

// ─── GET /connectors ──────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;

    const userConfigs = await prisma.connectorConfig.findMany({
      where: { ownerId: userId },
    });

    const merged = DEFAULT_CONNECTORS.map((def) => {
      const custom = userConfigs.find((c) => c.connectorKey === def.connectorKey);
      return {
        id: custom?.id || def.connectorKey,
        connectorKey: def.connectorKey,
        displayName: def.displayName,
        category: def.category,
        accessMode: def.accessMode,
        allowedActions: custom ? (custom.allowedActionsJson as any) : def.allowedActions,
        enabled: custom ? custom.enabled : def.enabled,
        authRequirement: def.authRequirement,
        status: def.status,
        notes: def.notes,
        lastSuccessAt: custom?.lastSuccessAt ?? null,
        lastErrorAt: custom?.lastErrorAt ?? null,
      };
    });

    res.status(200).json({ connectors: merged });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /connectors/:key ───────────────────────────────────────────────────

const patchSchema = z.object({
  enabled: z.boolean(),
});

router.patch('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { key } = req.params;

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const def = DEFAULT_CONNECTORS.find((d) => d.connectorKey === key);
    if (!def) {
      res.status(404).json({ error: 'Not found', message: `Connector "${key}" is not registered.` });
      return;
    }

    const config = await prisma.connectorConfig.upsert({
      where: { ownerId_connectorKey: { ownerId: userId, connectorKey: key } },
      update: { enabled: parsed.data.enabled },
      create: {
        ownerId: userId,
        connectorKey: key,
        displayName: def.displayName,
        category: def.category,
        accessMode: def.accessMode,
        allowedActionsJson: def.allowedActions,
        enabled: parsed.data.enabled,
      },
    });

    res.status(200).json(config);
  } catch (err) {
    next(err);
  }
});

export default router;
