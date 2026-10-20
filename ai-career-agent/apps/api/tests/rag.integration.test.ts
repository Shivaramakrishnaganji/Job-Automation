import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/lib/prisma';
import {
  getQdrantStatus,
  getEmbedding,
  indexDocumentChunks,
  searchRelevantEvidence,
  ensureQdrantCollection,
} from '../src/services/ai/qdrant.service';
import { ResourceType, ProcessingStatus } from '@prisma/client';

describe('RAG & Vector Search Verification Suite', () => {
  const testEmail = `test-rag-${Date.now()}@example.com`;
  let testUserId: string;
  let testResourceId: string;
  const createdChunkIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();

    // Create a temporary test user
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: 'dummy-hashed-pwd',
      },
    });
    testUserId = user.id;

    // Create a temporary resource file record
    const resource = await prisma.resourceFile.create({
      data: {
        userId: testUserId,
        originalFilename: 'Candidate_Project_Evidence.pdf',
        storagePath: './private-files/dummy-test-evidence.pdf',
        mimeType: 'application/pdf',
        contentHash: 'dummy-content-hash-' + Date.now(),
        resourceType: ResourceType.CANDIDATE_EVIDENCE,
        processingStatus: ProcessingStatus.PROCESSING,
      },
    });
    testResourceId = resource.id;
  });

  afterAll(async () => {
    // Clean up Qdrant vector points
    if (createdChunkIds.length > 0) {
      try {
        const url = (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
        const collection = process.env.QDRANT_COLLECTION || 'candidate_evidence';
        const apiKey = process.env.QDRANT_API_KEY;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['api-key'] = apiKey;

        await fetch(`${url}/collections/${collection}/points/delete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ points: createdChunkIds }),
        });
      } catch {
        // Best-effort cleanup
      }
    }

    // Clean up database records
    try {
      await prisma.resourceChunk.deleteMany({ where: { userId: testUserId } });
      await prisma.resourceFile.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    } catch {
      // Best-effort cleanup
    }

    await prisma.$disconnect();
  });

  // ── 1. Qdrant Connection & Status Check ──────────────────────────────────────
  it('connects to Qdrant Vector Cloud cluster and reports healthy status', async () => {
    const status = await getQdrantStatus();
    expect(status.connected).toBe(true);
    expect(status.collection).toBe(process.env.QDRANT_COLLECTION || 'candidate_evidence');
    expect(status.url).toBeDefined();
    expect(typeof status.pointsCount).toBe('number');
  });

  // ── 2. OpenAI Embedding Generation Check ─────────────────────────────────────
  it('generates a 1536-dimensional embedding using OpenAI text-embedding-3-small', async () => {
    const text = 'Developed an automated battery management system with thermal throttling using ESP32 and FreeRTOS.';
    const vector = await getEmbedding(text);

    expect(vector).not.toBeNull();
    expect(Array.isArray(vector)).toBe(true);
    expect(vector!.length).toBe(1536);
    expect(typeof vector![0]).toBe('number');
  });

  // ── 3. Indexing Chunks into Qdrant & PostgreSQL ──────────────────────────────
  it('indexes candidate evidence chunks into both Qdrant and PostgreSQL ResourceChunk', async () => {
    const chunks = [
      {
        chunkIndex: 0,
        text: 'Project: Solar Photovoltaic Inverter Design. Implemented maximum power point tracking (MPPT) algorithms using perturb and observe method on an STM32 ARM Cortex-M microcontroller. Built gate driver circuitry for high-frequency MOSFET switches with 96% peak efficiency.',
        metadata: { category: 'CORE_EEE', title: 'Solar PV Inverter' },
      },
      {
        chunkIndex: 1,
        text: 'Project: Distributed Microservices Event Bus. Built asynchronous event publisher/subscriber using Apache Kafka and Go. Handled 50,000 requests per second with Redis caching and Docker Swarm deployment.',
        metadata: { category: 'SOFTWARE_IT', title: 'Kafka Microservices' },
      },
      {
        chunkIndex: 2,
        text: 'Project: Retail Sales Forecasting & Churn Analysis. Developed regression and ARIMA models in Python using Pandas, Scikit-learn, and Statsmodels. Produced interactive Tableau executive dashboards for monthly churn prediction.',
        metadata: { category: 'BUSINESS_DATA_ANALYST', title: 'Sales Churn Analytics' },
      },
    ];

    const result = await indexDocumentChunks({
      userId: testUserId,
      resourceFileId: testResourceId,
      filename: 'Candidate_Project_Evidence.pdf',
      chunks,
    });

    expect(result.count).toBe(3);
    expect(result.indexedInQdrant).toBe(true);

    // Verify PostgreSQL persistence
    const savedChunks = await prisma.resourceChunk.findMany({
      where: { userId: testUserId },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(savedChunks.length).toBe(3);
    expect(savedChunks[0].textContent).toContain('Solar Photovoltaic Inverter');
    expect(savedChunks[1].textContent).toContain('Apache Kafka');
    expect(savedChunks[2].textContent).toContain('Retail Sales Forecasting');

    // Save IDs for cleanup
    savedChunks.forEach((c) => createdChunkIds.push(c.id));
  });

  // ── 4. Semantic Vector RAG Retrieval ─────────────────────────────────────────
  it('performs semantic vector retrieval in Qdrant and returns the most relevant evidence', async () => {
    // Query targeting the Solar Inverter / Embedded Systems domain
    const query = 'Looking for embedded firmware engineer with STM32 microcontroller and power electronics inverter experience';
    const hits = await searchRelevantEvidence({
      userId: testUserId,
      query,
      limit: 2,
    });

    expect(hits.length).toBeGreaterThan(0);
    // The top hit should be the Solar PV Inverter chunk
    const topHit = hits[0];
    expect(topHit.source).toBe('qdrant');
    expect(topHit.score).toBeGreaterThan(0.3); // Cosine similarity check
    expect(topHit.text).toContain('Solar Photovoltaic Inverter');
    expect(topHit.filename).toBe('Candidate_Project_Evidence.pdf');
  });

  // ── 5. User-Level Isolation in Qdrant Filter ──────────────────────────────────
  it('strictly isolates vector search by userId (prevents cross-user data leakage)', async () => {
    const nonExistentUserId = '00000000-0000-0000-0000-000000000099';
    const hits = await searchRelevantEvidence({
      userId: nonExistentUserId,
      query: 'Solar Photovoltaic Inverter STM32',
      limit: 5,
    });

    // Should return 0 hits because this user has no chunks in Qdrant or Postgres
    expect(hits.length).toBe(0);
  });
});
