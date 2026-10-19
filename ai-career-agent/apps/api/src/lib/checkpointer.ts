import { Pool } from 'pg';
import { parse } from 'pg-connection-string';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { MemorySaver } from '@langchain/langgraph';

let checkpointerInstance: any = null;
let poolInstance: Pool | null = null;

/**
 * Returns a singleton durable PostgreSQL checkpointer for LangGraph runs.
 * If DATABASE_URL is unavailable or initialization fails, falls back gracefully to MemorySaver.
 */
export function getCheckpointer(): any {
  if (checkpointerInstance) {
    return checkpointerInstance;
  }

  const connString = process.env.LANGGRAPH_CHECKPOINT_DATABASE_URL || process.env.DATABASE_URL;

  if (connString) {
    try {
      const config = parse(connString);
      // Ensure password is explicitly a string for pg SCRAM authentication
      if (config.password !== undefined) {
        config.password = String(config.password);
      }

      poolInstance = new Pool(config as any);
      const saver = new PostgresSaver(poolInstance);

      // Tables are created asynchronously in setup()
      saver.setup().catch((err: any) => {
        console.warn('[Checkpointer] Warning: PostgresSaver setup returned error:', err.message);
      });

      checkpointerInstance = saver;
      return checkpointerInstance;
    } catch (err: any) {
      console.warn('[Checkpointer] Failed to initialize PostgresSaver, falling back to MemorySaver:', err.message);
    }
  }

  checkpointerInstance = new MemorySaver();
  return checkpointerInstance;
}

export async function closeCheckpointer(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end().catch(() => {});
    poolInstance = null;
    checkpointerInstance = null;
  }
}
