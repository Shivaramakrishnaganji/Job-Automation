import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../lib/prisma';

// ─── Configuration ────────────────────────────────────────────────────────────

const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'candidate_evidence';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-offline',
});

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY;
  }
  return headers;
}

// ─── Embeddings Helper ────────────────────────────────────────────────────────

/**
 * Generate a 1536-dimensional embedding vector using OpenAI.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('dummy')) {
    return null;
  }

  try {
    const res = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // Protect against token limits
    });
    return res.data[0]?.embedding ?? null;
  } catch (err) {
    console.warn('[qdrant.service] OpenAI embedding generation failed:', err);
    return null;
  }
}

// ─── Collection Initialization ────────────────────────────────────────────────

let collectionVerified = false;

/**
 * Ensure the Qdrant vector collection exists with 1536 dimensions and Cosine distance.
 */
export async function ensureQdrantCollection(): Promise<boolean> {
  if (collectionVerified) return true;

  try {
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (checkRes.ok) {
      collectionVerified = true;
      return true;
    }

    // Collection does not exist, create it
    const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      }),
    });

    if (createRes.ok) {
      console.log(`[qdrant.service] Created vector collection: "${COLLECTION_NAME}"`);
      collectionVerified = true;
      return true;
    }

    return false;
  } catch (err) {
    // Qdrant server is offline or unreachable - non-blocking fallback
    return false;
  }
}

// ─── Index Chunks into Qdrant ─────────────────────────────────────────────────

export interface ChunkToIndex {
  chunkIndex: number;
  text: string;
  metadata?: Record<string, any>;
}

/**
 * Indexes text chunks from an uploaded document (PDF, resume, project dump) into Qdrant.
 * Also persists chunks into PostgreSQL ResourceChunk as a durable backup.
 */
export async function indexDocumentChunks(opts: {
  userId: string;
  resourceFileId: string;
  filename: string;
  chunks: ChunkToIndex[];
}): Promise<{ indexedInQdrant: boolean; count: number }> {
  const { userId, resourceFileId, filename, chunks } = opts;
  if (chunks.length === 0) return { indexedInQdrant: false, count: 0 };

  const isQdrantReady = await ensureQdrantCollection();
  const points: any[] = [];

  for (const chunk of chunks) {
    // 1. Save chunk in PostgreSQL
    const dbChunk = await prisma.resourceChunk.create({
      data: {
        userId,
        resourceFileId,
        chunkIndex: chunk.chunkIndex,
        textContent: chunk.text,
        metadataJson: {
          filename,
          ...(chunk.metadata || {}),
        },
      },
    });

    // 2. Prepare vector if Qdrant is connected
    if (isQdrantReady) {
      const vector = await getEmbedding(chunk.text);
      if (vector) {
        points.push({
          id: dbChunk.id, // Consistent UUID matching database chunk
          vector,
          payload: {
            userId,
            resourceFileId,
            filename,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            category: chunk.metadata?.category || 'CANDIDATE_EVIDENCE',
          },
        });
      }
    }
  }

  // 3. Batch upsert points to Qdrant
  let indexedInQdrant = false;
  if (isQdrantReady && points.length > 0) {
    try {
      const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ points }),
      });

      if (upsertRes.ok) {
        indexedInQdrant = true;
        console.log(`[qdrant.service] Indexed ${points.length} vectors into Qdrant for user ${userId}`);
      }
    } catch (err) {
      console.warn('[qdrant.service] Qdrant upsert failed, chunks safely preserved in PostgreSQL:', err);
    }
  }

  return { indexedInQdrant, count: chunks.length };
}

// ─── Semantic Vector Search ───────────────────────────────────────────────────

export interface EvidenceSearchResult {
  id: string;
  text: string;
  filename?: string;
  score: number;
  source: 'qdrant' | 'postgres_fallback';
}

/**
 * Searches relevant candidate evidence across dumped resumes, projects, and PDFs.
 * Primary: Qdrant vector semantic search filtered by userId.
 * Fallback: PostgreSQL ResourceChunk text retrieval if Qdrant is offline.
 */
export async function searchRelevantEvidence(opts: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<EvidenceSearchResult[]> {
  const { userId, query, limit = 5 } = opts;
  const isQdrantReady = await ensureQdrantCollection();

  // Try Qdrant semantic vector search
  if (isQdrantReady) {
    const queryVector = await getEmbedding(query);
    if (queryVector) {
      try {
        const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            vector: queryVector,
            limit,
            filter: {
              must: [
                {
                  key: 'userId',
                  match: { value: userId },
                },
              ],
            },
            with_payload: true,
          }),
        });

        if (searchRes.ok) {
          const body = (await searchRes.json()) as any;
          const hits = body.result || [];
          if (hits.length > 0) {
            return hits.map((hit: any) => ({
              id: hit.id,
              text: hit.payload?.text || '',
              filename: hit.payload?.filename,
              score: hit.score,
              source: 'qdrant',
            }));
          }
        }
      } catch (err) {
        console.warn('[qdrant.service] Qdrant search failed, falling back to PostgreSQL:', err);
      }
    }
  }

  // Graceful Fallback: Query PostgreSQL ResourceChunks
  const chunks = await prisma.resourceChunk.findMany({
    where: { userId },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return chunks.map((c) => ({
    id: c.id,
    text: c.textContent,
    filename: (c.metadataJson as any)?.filename,
    score: 0.85,
    source: 'postgres_fallback',
  }));
}

// ─── Qdrant Connection Health Status ──────────────────────────────────────────

export async function getQdrantStatus(): Promise<{
  connected: boolean;
  collection: string;
  url: string;
}> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    return {
      connected: res.ok,
      collection: COLLECTION_NAME,
      url: QDRANT_URL,
    };
  } catch {
    return {
      connected: false,
      collection: COLLECTION_NAME,
      url: QDRANT_URL,
    };
  }
}
