import { Router } from 'express';
import authRouter from './auth';
import profileRouter from './profile';
import jobsRouter from './jobs';
import applicationsRouter from './applications';
import resourcesRouter from './resources';
import contactsRouter from './contacts';
import agentRunsRouter from './agent-runs';
import connectorsRouter from './connectors';
import dashboardRouter from './dashboard';
import settingsRouter from './settings';

export const router = Router();

router.use('/auth', authRouter);
router.use('/profile', profileRouter);
router.use('/jobs', jobsRouter);
router.use('/applications', applicationsRouter);
router.use('/resources', resourcesRouter);
router.use('/contacts', contactsRouter);
router.use('/agent-runs', agentRunsRouter);
router.use('/connectors', connectorsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/settings', settingsRouter);
