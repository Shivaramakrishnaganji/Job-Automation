import { Annotation } from '@langchain/langgraph';

export type CareerTrack = 'software_it' | 'core_eee' | 'business_data_analyst';

export const CareerAgentStateAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  userId: Annotation<string>(),
  mode: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => 'daily_discovery',
  }),
  tracks: Annotation<CareerTrack[]>({
    reducer: (_current, update) => update,
    default: () => ['software_it', 'core_eee', 'business_data_analyst'],
  }),
  connectorIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => ['greenhouse', 'lever'],
  }),
  resourceFileIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  rawDiscoveredJobs: Annotation<any[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  discoveredJobIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  verifiedJobIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  matchIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  failedConnectorIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  warnings: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  currentStage: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => 'initialized',
  }),
  outcome: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => 'running',
  }),
});

export type CareerAgentState = typeof CareerAgentStateAnnotation.State;
