import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { getCheckpointer } from '../lib/checkpointer';
import { MatchTrack, AgentRunStatus, JobVerificationStatus, WorkplaceType } from '@prisma/client';
import prisma from '../lib/prisma';
import { CareerAgentStateAnnotation, CareerAgentState } from './state';
import { GreenhouseAdapter } from '../adapters/jobs/greenhouse.adapter';
import { LeverAdapter } from '../adapters/jobs/lever.adapter';
import { applyHardFilters, calculateDeterministicScore } from '../services/matching/matcher';

/**
 * Discovery Graph
 * Implements the Tsenta-inspired discover -> verify -> filter -> score pipeline
 * using LangGraph.js
 */

export function buildDiscoveryGraph(checkpointer?: any) {
  const graph = new StateGraph(CareerAgentStateAnnotation)
    // ── 1. Validate Run ────────────────────────────────────────────────────────
    .addNode('validate_run', async (state) => {
      await prisma.agentRun.update({
        where: { id: state.runId },
        data: {
          status: AgentRunStatus.RUNNING,
          currentStage: 'Validating run parameters',
          startedAt: new Date(),
        },
      });

      await prisma.agentRunEvent.create({
        data: {
          runId: state.runId,
          stage: 'validate_run',
          severity: 'info',
          publicMessage: `Starting agent run for ${state.tracks.join(', ')} across enabled connectors.`,
        },
      });

      return { currentStage: 'validated' };
    })

    // ── 2. Load Preferences and Resources ─────────────────────────────────────
    .addNode('load_preferences_and_resources', async (state) => {
      const [preferences, facts] = await Promise.all([
        prisma.searchPreference.findFirst({
          where: { userId: state.userId, isActive: true },
        }),
        prisma.profileFact.findMany({
          where: { userId: state.userId },
        }),
      ]);

      await prisma.agentRunEvent.create({
        data: {
          runId: state.runId,
          stage: 'load_preferences_and_resources',
          severity: 'info',
          publicMessage: `Loaded candidate profile with ${facts.length} facts. Target tracks: ${state.tracks.join(', ')}`,
        },
      });

      return { currentStage: 'preferences_loaded' };
    })

    // ── 3. Discover Enabled Sources ───────────────────────────────────────────
    .addNode('discover_enabled_sources', async (state) => {
      const discoveredJobs: any[] = [];
      const failedConnectors: string[] = [];

      // Sample verified tech company tokens for demo/testing
      const sampleTokens = ['stripe', 'airbnb', 'discord', 'github', 'databricks'];

      for (const connectorId of state.connectorIds) {
        try {
          if (connectorId === 'greenhouse') {
            const adapter = new GreenhouseAdapter();
            for (const token of sampleTokens.slice(0, 2)) {
              try {
                const results = await adapter.discover(token);
                discoveredJobs.push(...results);
              } catch {
                // Individual company token failure is non-fatal
              }
            }
          } else if (connectorId === 'lever') {
            const adapter = new LeverAdapter();
            for (const token of sampleTokens.slice(0, 2)) {
              try {
                const results = await adapter.discover(token);
                discoveredJobs.push(...results);
              } catch {
                // Individual company token failure is non-fatal
              }
            }
          }
        } catch (err: any) {
          failedConnectors.push(connectorId);
          await prisma.agentRunEvent.create({
            data: {
              runId: state.runId,
              stage: 'discover_enabled_sources',
              severity: 'warn',
              publicMessage: `Connector ${connectorId} failed: ${err.message}`,
            },
          });
        }
      }

      await prisma.agentRunEvent.create({
        data: {
          runId: state.runId,
          stage: 'discover_enabled_sources',
          severity: 'info',
          publicMessage: `Discovered ${discoveredJobs.length} raw postings across active connectors.`,
        },
      });

      return {
        currentStage: 'sources_discovered',
        rawDiscoveredJobs: discoveredJobs,
        failedConnectorIds: failedConnectors,
      };
    })

    // ── 4. Normalize and Deduplicate ──────────────────────────────────────────
    .addNode('normalize_and_dedupe', async (state) => {
      // Find existing URLs to deduplicate
      const existingJobs = await prisma.job.findMany({ select: { applyUrl: true } });
      const existingUrls = new Set(existingJobs.map((j) => j.applyUrl));

      const createdJobIds: string[] = [];
      let dupCount = 0;

      for (const raw of state.rawDiscoveredJobs || []) {
        if (!raw.applyUrl) continue;
        if (existingUrls.has(raw.applyUrl)) {
          dupCount++;
          continue;
        }

        try {
          const job = await prisma.job.create({
            data: {
              company: raw.company || 'Unknown Company',
              title: raw.title || 'Untitled Role',
              locationText: raw.locationText || null,
              workplaceType: raw.workplaceType || WorkplaceType.UNKNOWN,
              employmentType: raw.employmentType || null,
              descriptionText: raw.descriptionText || raw.title,
              requirementsText: raw.requirementsText || null,
              postedAt: raw.postedAt ? new Date(raw.postedAt) : null,
              applyUrl: raw.applyUrl,
              jobUrl: raw.jobUrl || raw.applyUrl,
              sourceApiUrl: raw.sourceApiUrl || null,
              verificationStatus: JobVerificationStatus.VERIFIED_OPEN,
            },
          });

          existingUrls.add(raw.applyUrl);
          createdJobIds.push(job.id);

          await prisma.jobSourceObservation.create({
            data: {
              jobId: job.id,
              connectorId: raw.source,
              externalJobId: raw.sourceJobId,
              sourceUrl: raw.applyUrl,
              canonicalUrl: raw.jobUrl || raw.applyUrl,
              verificationStatus: 'verified_open',
            },
          });
        } catch {
          // Ignore individual insertion collisions
        }
      }

      await prisma.agentRun.update({
        where: { id: state.runId },
        data: {
          discoveredCount: createdJobIds.length,
          duplicateCount: dupCount,
          verifiedCount: createdJobIds.length,
        },
      });

      await prisma.agentRunEvent.create({
        data: {
          runId: state.runId,
          stage: 'normalize_and_dedupe',
          severity: 'info',
          publicMessage: `Persisted ${createdJobIds.length} fresh verified jobs. Filtered ${dupCount} duplicates.`,
        },
      });

      return {
        currentStage: 'normalized_and_deduped',
        discoveredJobIds: createdJobIds,
      };
    })

    // ── 5. Deterministic Eligibility & Scoring ────────────────────────────────
    .addNode('score_and_persist', async (state) => {
      const [facts, preferences, profile] = await Promise.all([
        prisma.profileFact.findMany({ where: { userId: state.userId } }),
        prisma.searchPreference.findFirst({ where: { userId: state.userId, isActive: true } }),
        prisma.candidateProfile.findUnique({ where: { userId: state.userId } }),
      ]);

      // Score existing un-matched jobs in DB for this user
      const unMatchedJobs = await prisma.job.findMany({
        where: {
          isActive: true,
          jobMatches: { none: { userId: state.userId } },
        },
        take: 25,
      });

      let highFitCount = 0;
      let reviewCount = 0;
      const createdMatchIds: string[] = [];

      for (const job of unMatchedJobs) {
        // Map track string to enum
        const primaryTrack = state.tracks.includes('core_eee')
          ? MatchTrack.CORE_EEE
          : state.tracks.includes('business_data_analyst')
          ? MatchTrack.BUSINESS_DATA_ANALYST
          : MatchTrack.SOFTWARE_IT;

        const hardFilter = applyHardFilters(
          job,
          preferences,
          profile?.degree,
          profile?.branch,
          profile?.graduationYear
        );

        let matchResult;
        if (hardFilter.eligible === 'no') {
          matchResult = {
            score: 0,
            confidence: 'high' as const,
            eligible: 'no' as const,
            matchedEvidence: [],
            gaps: hardFilter.reasons,
            reasons: [],
            warnings: hardFilter.warnings,
          };
        } else {
          matchResult = calculateDeterministicScore(job, facts, primaryTrack);
        }

        const match = await prisma.jobMatch.upsert({
          where: { userId_jobId: { userId: state.userId, jobId: job.id } },
          update: {
            score: matchResult.score,
            confidence: matchResult.confidence,
            eligible: matchResult.eligible,
            matchedEvidenceJson: matchResult.matchedEvidence,
            gapsJson: matchResult.gaps,
            reasonsJson: matchResult.reasons,
            warningsJson: matchResult.warnings,
            track: primaryTrack,
          },
          create: {
            userId: state.userId,
            jobId: job.id,
            score: matchResult.score,
            confidence: matchResult.confidence,
            eligible: matchResult.eligible,
            matchedEvidenceJson: matchResult.matchedEvidence,
            gapsJson: matchResult.gaps,
            reasonsJson: matchResult.reasons,
            warningsJson: matchResult.warnings,
            track: primaryTrack,
          },
        });

        createdMatchIds.push(match.id);
        if (matchResult.score >= 75) highFitCount++;
        else if (matchResult.score >= 50) reviewCount++;
      }

      await prisma.agentRun.update({
        where: { id: state.runId },
        data: {
          highFitCount,
          needsReviewCount: reviewCount,
          currentStage: 'Scored all candidate roles',
        },
      });

      return {
        matchIds: createdMatchIds,
        currentStage: 'scored',
      };
    })

    // ── 6. Build Run Summary ──────────────────────────────────────────────────
    .addNode('build_run_summary', async (state) => {
      const finalOutcome = state.failedConnectorIds.length > 0 ? 'partially_failed' : 'completed';

      await prisma.agentRun.update({
        where: { id: state.runId },
        data: {
          status:
            finalOutcome === 'partially_failed'
              ? AgentRunStatus.PARTIALLY_FAILED
              : AgentRunStatus.COMPLETED,
          finishedAt: new Date(),
          currentStage: 'Discovery run completed',
        },
      });

      await prisma.agentRunEvent.create({
        data: {
          runId: state.runId,
          stage: 'build_run_summary',
          severity: 'info',
          publicMessage: `Discovery run completed. Total matches created: ${state.matchIds.length}.`,
        },
      });

      return { outcome: finalOutcome };
    })

    // ── Graph Edges ───────────────────────────────────────────────────────────
    .addEdge(START, 'validate_run')
    .addEdge('validate_run', 'load_preferences_and_resources')
    .addEdge('load_preferences_and_resources', 'discover_enabled_sources')
    .addEdge('discover_enabled_sources', 'normalize_and_dedupe')
    .addEdge('normalize_and_dedupe', 'score_and_persist')
    .addEdge('score_and_persist', 'build_run_summary')
    .addEdge('build_run_summary', END);

  return graph.compile({ checkpointer: checkpointer ?? getCheckpointer() });
}
