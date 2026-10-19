import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AgentRunStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { buildDiscoveryGraph } from '../graphs/discovery.graph';
import { CareerTrack } from '../graphs/state';

const router = Router();
router.use(requireAuth);

const startRunSchema = z.object({
  mode: z.enum([
    'daily_discovery',
    'focused_track',
    'company_sweep',
    'since_last_run',
    'resource_driven',
  ]).default('daily_discovery'),
  tracks: z.array(z.enum(['software_it', 'core_eee', 'business_data_analyst'])).default([
    'software_it',
    'core_eee',
    'business_data_analyst',
  ]),
  connectorIds: z.array(z.string()).default(['greenhouse', 'lever']),
  maxResults: z.number().int().min(5).max(100).default(50),
  minFitScore: z.number().int().min(0).max(100).default(60),
});

// ─── POST /agent-runs ─────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const parsed = startRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const { mode, tracks, connectorIds, maxResults, minFitScore } = parsed.data;

    const graphThreadId = `thread-${uuidv4()}`;

    // Create AgentRun record
    const run = await prisma.agentRun.create({
      data: {
        ownerId: userId,
        mode,
        selectedTracksJson: tracks,
        selectedConnectorsJson: connectorIds,
        filtersJson: { maxResults, minFitScore },
        status: AgentRunStatus.QUEUED,
        graphThreadId,
        currentStage: 'Queued in Agent Runner',
        estimatedCostUsd: 0.05,
      },
    });

    await logAudit({
      userId,
      action: 'AGENT_RUN_LAUNCHED',
      entityType: 'AgentRun',
      entityId: run.id,
      metadata: { mode, tracks, graphThreadId },
    });

    // Launch discovery graph asynchronously
    const discoveryGraph = buildDiscoveryGraph();
    discoveryGraph
      .invoke(
        {
          runId: run.id,
          userId,
          mode,
          tracks: tracks as CareerTrack[],
          connectorIds,
        },
        { configurable: { thread_id: graphThreadId } }
      )
      .catch(async (err: any) => {
        await prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: AgentRunStatus.FAILED,
            errorSummary: err.message || 'Execution error in graph',
          },
        }).catch(() => {});
      });

    res.status(202).json({
      runId: run.id,
      status: run.status,
      graphThreadId,
      message: 'Agent runner launched successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agent-runs ──────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const runs = await prisma.agentRun.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.status(200).json({ runs });
  } catch (err) {
    next(err);
  }
});

// ─── GET /agent-runs/:id ──────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const run = await prisma.agentRun.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { timestamp: 'asc' },
          take: 50,
        },
      },
    });

    if (!run || run.ownerId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Run not found' });
      return;
    }

    res.status(200).json(run);
  } catch (err) {
    next(err);
  }
});

// ─── POST /agent-runs/:id/cancel ──────────────────────────────────────────────

router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const run = await prisma.agentRun.findUnique({ where: { id } });
    if (!run || run.ownerId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Run not found' });
      return;
    }

    if (run.status === AgentRunStatus.COMPLETED || run.status === AgentRunStatus.CANCELED) {
      res.status(400).json({ error: 'Invalid state', message: `Cannot cancel a run with status: ${run.status}` });
      return;
    }

    const updated = await prisma.agentRun.update({
      where: { id },
      data: {
        status: AgentRunStatus.CANCELED,
        canceledAt: new Date(),
        currentStage: 'Canceled by user',
      },
    });

    await prisma.agentRunEvent.create({
      data: {
        runId: id,
        stage: 'cancel',
        severity: 'warn',
        publicMessage: 'Run canceled by user.',
      },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
