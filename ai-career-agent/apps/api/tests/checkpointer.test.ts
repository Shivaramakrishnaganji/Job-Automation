import { describe, it, expect, afterAll } from 'vitest';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { getCheckpointer, closeCheckpointer } from '../src/lib/checkpointer';
import { v4 as uuidv4 } from 'uuid';

describe('LangGraph Durable Checkpointing (PostgreSQL)', () => {
  afterAll(async () => {
    await closeCheckpointer();
  });

  it('initializes a durable checkpointer and compiles a state graph', () => {
    const checkpointer = getCheckpointer();
    expect(checkpointer).toBeDefined();

    const TestState = Annotation.Root({
      count: Annotation<number>({
        reducer: (curr, next) => next,
        default: () => 0,
      }),
      stage: Annotation<string>({
        reducer: (curr, next) => next,
        default: () => 'init',
      }),
    });

    const graph = new StateGraph(TestState)
      .addNode('step1', (s) => ({ count: s.count + 1, stage: 'step1_done' }))
      .addNode('step2', (s) => ({ count: s.count + 10, stage: 'step2_done' }))
      .addEdge('__start__', 'step1')
      .addEdge('step1', 'step2')
      .addEdge('step2', '__end__')
      .compile({ checkpointer });

    expect(graph).toBeDefined();
  });

  it('persists and retrieves execution state across independent graph calls using thread_id', async () => {
    const checkpointer = getCheckpointer();
    const threadId = `durable-test-${uuidv4()}`;

    const TestState = Annotation.Root({
      progress: Annotation<number>({
        reducer: (curr, next) => next,
        default: () => 0,
      }),
      checkpointValue: Annotation<string>({
        reducer: (curr, next) => next,
        default: () => '',
      }),
    });

    const graph = new StateGraph(TestState)
      .addNode('process', (s) => ({
        progress: 100,
        checkpointValue: 'persisted_in_postgres',
      }))
      .addEdge('__start__', 'process')
      .addEdge('process', '__end__')
      .compile({ checkpointer });

    // Execute graph with unique thread ID
    const result = await graph.invoke(
      { progress: 10, checkpointValue: 'initial' },
      { configurable: { thread_id: threadId } }
    );

    expect(result.progress).toBe(100);
    expect(result.checkpointValue).toBe('persisted_in_postgres');

    // Retrieve checkpoint directly from the checkpointer
    const tuple = await checkpointer.getTuple({ configurable: { thread_id: threadId } });
    expect(tuple).toBeDefined();
    expect(tuple.checkpoint).toBeDefined();
    expect(tuple.checkpoint.channel_values.progress).toBe(100);
    expect(tuple.checkpoint.channel_values.checkpointValue).toBe('persisted_in_postgres');
  });
});
