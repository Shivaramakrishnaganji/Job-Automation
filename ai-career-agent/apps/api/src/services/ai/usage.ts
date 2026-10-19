import prisma from '../../lib/prisma';

export interface UsageRecord {
  userId: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  success: boolean;
}

/**
 * Estimate cost in USD based on published per-million-token rates.
 * Rates are illustrative — update from https://platform.openai.com/pricing
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // per million tokens
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-6-luna':  { input: 0.10,  output: 0.50  },
    'gpt6luna':    { input: 0.10,  output: 0.50  },
    'gpt-4o':      { input: 2.50,  output: 10.00 },
    'gpt-4o-mini': { input: 0.15,  output: 0.60  },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
  };
  const normalized = model.toLowerCase().replace(/^gpt6luna$/i, 'gpt-6-luna');
  const modelKey =
    Object.keys(pricing).find((k) => normalized.startsWith(k)) ?? 'gpt-6-luna';
  const rates = pricing[modelKey] ?? { input: 0.10, output: 0.50 };
  return (
    (inputTokens  / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output
  );
}

/** Persist a single AI call record including its estimated cost. */
export async function recordUsage(record: UsageRecord): Promise<void> {
  const estimatedCost = estimateCostUsd(
    record.model,
    record.inputTokens,
    record.outputTokens,
  );
  await prisma.aiUsageEvent.create({
    data: {
      userId:       record.userId,
      model:        record.model,
      operation:    record.operation,
      inputTokens:  record.inputTokens,
      outputTokens: record.outputTokens,
      estimatedCost,
      latencyMs:    record.latencyMs,
      success:      record.success,
    },
  });
}

export interface BudgetStatus {
  withinBudget:  boolean;
  dailySpent:    number;
  monthlySpent:  number;
}

/**
 * Check whether the user is still within their configured daily and monthly
 * AI-spend budgets (read from AI_DAILY_BUDGET_USD / AI_MONTHLY_BUDGET_USD).
 */
export async function checkBudget(userId: string): Promise<BudgetStatus> {
  const dailyBudget   = parseFloat(process.env.AI_DAILY_BUDGET_USD   ?? '0.50');
  const monthlyBudget = parseFloat(process.env.AI_MONTHLY_BUDGET_USD  ?? '10.00');

  const now          = new Date();
  const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailyResult, monthlyResult] = await Promise.all([
    prisma.aiUsageEvent.aggregate({
      where:  { userId, createdAt: { gte: startOfDay },   success: true },
      _sum:   { estimatedCost: true },
    }),
    prisma.aiUsageEvent.aggregate({
      where:  { userId, createdAt: { gte: startOfMonth }, success: true },
      _sum:   { estimatedCost: true },
    }),
  ]);

  const dailySpent   = dailyResult._sum.estimatedCost   ?? 0;
  const monthlySpent = monthlyResult._sum.estimatedCost ?? 0;

  return {
    withinBudget: dailySpent < dailyBudget && monthlySpent < monthlyBudget,
    dailySpent,
    monthlySpent,
  };
}
