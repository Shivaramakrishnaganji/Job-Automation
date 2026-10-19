import OpenAI from 'openai';
import { z } from 'zod';
import { recordUsage, checkBudget } from './usage';

// ---------------------------------------------------------------------------
// Client & default model
// ---------------------------------------------------------------------------

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-offline' });
const rawModel = process.env.OPENAI_MODEL ?? 'gpt-6-luna';
const MODEL  = rawModel.replace(/^gpt6luna$/i, 'gpt-6-luna');

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ExtractedFactsSchema = z.object({
  facts: z.array(
    z.object({
      category:   z.enum(['EDUCATION', 'SKILL', 'EXPERIENCE', 'PROJECT', 'CREDENTIAL', 'ACHIEVEMENT']),
      label:      z.string(),
      value:      z.string(),
      sourceSpan: z.string().optional(), // exact text excerpt this fact was derived from
    }),
  ),
  warnings: z.array(z.string()),
});

const ExtractedJobSchema = z.object({
  title:              z.string(),
  company:            z.string().nullable(),
  seniority:          z.enum(['fresher', 'junior', 'mid', 'senior', 'unknown']),
  requiredSkills:     z.array(z.string()),
  preferredSkills:    z.array(z.string()),
  requiredDegree:     z.string().nullable(),
  requiredBranch:     z.string().nullable(),
  minExperienceYears: z.number().nullable(),
  locationText:       z.string().nullable(),
  workplaceType:      z.enum(['onsite', 'hybrid', 'remote', 'unknown']),
  employmentType:     z.string().nullable(),
  salaryMin:          z.number().nullable(),
  salaryMax:          z.number().nullable(),
  salaryCurrency:     z.string().nullable(),
  applyUrl:           z.string().nullable(),
  uncertainties:      z.array(z.string()),
});

const JobMatchSchema = z.object({
  score:           z.number().int().min(0).max(100),
  confidence:      z.enum(['high', 'medium', 'low']),
  eligible:        z.enum(['yes', 'likely', 'unlikely', 'no', 'unknown']),
  matchedEvidence: z.array(
    z.object({
      requirement:    z.string(),
      profileFactIds: z.array(z.string()),
    }),
  ),
  gaps:     z.array(z.string()),
  reasons:  z.array(z.string()),
  warnings: z.array(z.string()),
});

const TailoredResumeSchema = z.object({
  headline: z.string(),
  summary:  z.string(),
  skills:   z.array(
    z.object({
      name:            z.string(),
      evidenceFactIds: z.array(z.string()),
    }),
  ),
  experienceBullets: z.array(
    z.object({
      text:            z.string(),
      evidenceFactIds: z.array(z.string()),
      changedFromBase: z.boolean(),
    }),
  ),
  projectBullets: z.array(
    z.object({
      projectFactId:   z.string(),
      text:            z.string(),
      evidenceFactIds: z.array(z.string()),
    }),
  ),
  missingEvidence: z.array(z.string()),
  warnings:        z.array(z.string()),
});

const OutreachDraftSchema = z.object({
  note:            z.string().max(300),
  evidenceFactIds: z.array(z.string()),
  warnings:        z.array(z.string()),
});

const CoverLetterSchema = z.object({
  body:            z.string(),
  evidenceFactIds: z.array(z.string()),
  warnings:        z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Exported inferred types
// ---------------------------------------------------------------------------

export type ExtractedFacts   = z.infer<typeof ExtractedFactsSchema>;
export type ExtractedJob     = z.infer<typeof ExtractedJobSchema>;
export type JobMatch         = z.infer<typeof JobMatchSchema>;
export type TailoredResume   = z.infer<typeof TailoredResumeSchema>;
export type OutreachDraft    = z.infer<typeof OutreachDraftSchema>;
export type CoverLetter      = z.infer<typeof CoverLetterSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class BudgetExceededError extends Error {
  constructor(message = 'AI budget limit reached') {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class AIValidationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(
      `AI response validation failed for "${operation}": ${issues
        .map((i) => `${i.path.join('.')} — ${i.message}`)
        .join('; ')}`,
    );
    this.name = 'AIValidationError';
  }
}

// ---------------------------------------------------------------------------
// Private helper — callWithRetry
// ---------------------------------------------------------------------------

/**
 * Wraps client.chat.completions.create with:
 *   • JSON mode (response_format: { type: 'json_object' })
 *   • 60-second timeout
 *   • Up to 2 retries on 429 rate-limit errors with 2 s exponential back-off
 * Returns the parsed JSON object (un-validated).
 */
async function callWithRetry(
  systemPrompt: string,
  userContent:  string,
  maxRetries    = 2,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create(
        {
          model:           MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userContent  },
          ],
        },
        { timeout: 60_000 },
      );

      const text = response.choices[0]?.message?.content ?? '';
      return JSON.parse(text);
    } catch (err: any) {
      lastError = err;

      // Retry only on rate-limit errors
      const isRateLimit =
        err?.status === 429 ||
        (err instanceof OpenAI.APIError && err.status === 429);

      if (!isRateLimit || attempt === maxRetries) {
        throw err;
      }

      const backoffMs = 2_000 * Math.pow(2, attempt); // 2 s, then 4 s
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Private guard — budget check
// ---------------------------------------------------------------------------

async function guardBudget(userId: string): Promise<void> {
  const status = await checkBudget(userId);
  if (!status.withinBudget) {
    throw new BudgetExceededError(
      `AI budget exceeded. Daily: \$${status.dailySpent.toFixed(4)}, Monthly: \$${status.monthlySpent.toFixed(4)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Private helper — timed AI call with usage recording
// ---------------------------------------------------------------------------

async function timedCall<T>(opts: {
  userId:       string;
  operation:    string;
  systemPrompt: string;
  userContent:  string;
  schema:       z.ZodType<T>;
}): Promise<T> {
  await guardBudget(opts.userId);

  const start = Date.now();
  let success = false;
  let inputTokens  = 0;
  let outputTokens = 0;

  try {
    // We need token counts so we call the underlying API directly via the
    // retry wrapper which returns the full parsed JSON.
    // For token tracking we use a separate low-level request that returns
    // usage data. We replicate the call but capture usage from the response.
    const rawResponse = await client.chat.completions.create(
      {
        model:           MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user',   content: opts.userContent  },
        ],
      },
      { timeout: 60_000 },
    );

    inputTokens  = rawResponse.usage?.prompt_tokens     ?? 0;
    outputTokens = rawResponse.usage?.completion_tokens ?? 0;

    const text = rawResponse.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(text);

    const validated = opts.schema.safeParse(parsed);
    if (!validated.success) {
      throw new AIValidationError(opts.operation, validated.error.issues);
    }

    success = true;
    return validated.data;
  } finally {
    const latencyMs = Date.now() - start;
    await recordUsage({
      userId:   opts.userId,
      model:    MODEL,
      operation: opts.operation,
      inputTokens,
      outputTokens,
      latencyMs,
      success,
    }).catch(() => { /* never let usage recording crash the caller */ });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a resume document and return structured candidate facts.
 */
export async function extractCandidateFacts(
  documentText: string,
  userId:       string,
): Promise<ExtractedFacts> {
  return timedCall({
    userId,
    operation: 'extractCandidateFacts',
    systemPrompt:
      'You are a resume parser. Extract structured facts from the resume text. ' +
      'Return only facts that are explicitly stated. Do not invent or infer information not present in the text. ' +
      'Respond with a JSON object matching the schema: ' +
      '{ facts: Array<{ category: "EDUCATION"|"SKILL"|"EXPERIENCE"|"PROJECT"|"CREDENTIAL"|"ACHIEVEMENT", ' +
      'label: string, value: string, sourceSpan?: string }>, warnings: string[] }',
    userContent: documentText,
    schema:      ExtractedFactsSchema,
  });
}

/**
 * Parse a job posting and return normalised job details.
 */
export async function extractJobDetails(
  jobDescription: string,
  userId:         string,
): Promise<ExtractedJob> {
  return timedCall({
    userId,
    operation: 'extractJobDetails',
    systemPrompt:
      'Extract structured job details from the posting. Mark fields as null when not explicitly stated. ' +
      'Do not infer or hallucinate values. ' +
      'Respond with a JSON object matching the schema: ' +
      '{ title: string, company: string|null, seniority: "fresher"|"junior"|"mid"|"senior"|"unknown", ' +
      'requiredSkills: string[], preferredSkills: string[], requiredDegree: string|null, ' +
      'requiredBranch: string|null, minExperienceYears: number|null, locationText: string|null, ' +
      'workplaceType: "onsite"|"hybrid"|"remote"|"unknown", employmentType: string|null, ' +
      'salaryMin: number|null, salaryMax: number|null, salaryCurrency: string|null, ' +
      'applyUrl: string|null, uncertainties: string[] }',
    userContent: jobDescription,
    schema:      ExtractedJobSchema,
  });
}

/**
 * Score how well a candidate's profile matches a normalised job.
 */
export async function scoreJobMatch(
  profileFacts:  unknown[],
  preferences:   unknown,
  normalizedJob: unknown,
  userId:        string,
): Promise<JobMatch> {
  return timedCall({
    userId,
    operation: 'scoreJobMatch',
    systemPrompt:
      'You are a job match scorer. Given verified candidate facts and a job description, ' +
      'produce a structured match score. Use ONLY the provided facts. ' +
      'Do not assume skills or experience not listed. ' +
      'Respond with a JSON object matching: ' +
      '{ score: number (0-100), confidence: "high"|"medium"|"low", ' +
      'eligible: "yes"|"likely"|"unlikely"|"no"|"unknown", ' +
      'matchedEvidence: Array<{ requirement: string, profileFactIds: string[] }>, ' +
      'gaps: string[], reasons: string[], warnings: string[] }',
    userContent: JSON.stringify({ profileFacts, preferences, job: normalizedJob }),
    schema:      JobMatchSchema,
  });
}

/**
 * Tailor a base resume for a specific job, citing verified facts throughout.
 */
export async function tailorResume(
  profileFacts: unknown[],
  baseResume:   string,
  job:          unknown,
  userId:       string,
): Promise<TailoredResume> {
  return timedCall({
    userId,
    operation: 'tailorResume',
    systemPrompt:
      'You are a resume tailoring assistant. Tailor this resume for the job. ' +
      'Use ONLY verified facts provided. ' +
      'Every bullet with a factual claim MUST reference a profileFactId. ' +
      'Never fabricate metrics, certifications, or experience. ' +
      'Respond with a JSON object matching: ' +
      '{ headline: string, summary: string, ' +
      'skills: Array<{ name: string, evidenceFactIds: string[] }>, ' +
      'experienceBullets: Array<{ text: string, evidenceFactIds: string[], changedFromBase: boolean }>, ' +
      'projectBullets: Array<{ projectFactId: string, text: string, evidenceFactIds: string[] }>, ' +
      'missingEvidence: string[], warnings: string[] }',
    userContent: JSON.stringify({ profileFacts, baseResume, job }),
    schema:      TailoredResumeSchema,
  });
}

/**
 * Draft a LinkedIn outreach note referencing only verified facts.
 */
export async function draftOutreach(
  profileFacts:  unknown[],
  job:           unknown,
  contactSource: string,
  userId:        string,
): Promise<OutreachDraft> {
  return timedCall({
    userId,
    operation: 'draftOutreach',
    systemPrompt:
      'Write a brief, respectful LinkedIn connection note for the candidate to review. ' +
      'Use only the verified candidate facts and the supplied job/company context. ' +
      'Do not claim prior contact, a referral, or a relationship that is not in the facts. ' +
      'Do not ask for a job offer. State a specific, honest reason for connecting. ' +
      'Maximum 280 characters. ' +
      'Respond with a JSON object matching: ' +
      '{ note: string (max 300 chars), evidenceFactIds: string[], warnings: string[] }',
    userContent: JSON.stringify({ profileFacts, job, contactSource }),
    schema:      OutreachDraftSchema,
  });
}

/**
 * Draft a cover letter using only verified profile facts.
 */
export async function draftCoverLetter(
  profileFacts:    unknown[],
  approvedResume:  unknown,
  job:             unknown,
  userId:          string,
): Promise<CoverLetter> {
  return timedCall({
    userId,
    operation: 'draftCoverLetter',
    systemPrompt:
      'Write a truthful, concise cover letter. ' +
      'Use ONLY the verified profile facts provided. ' +
      'Never claim experience or skills not in the facts. ' +
      'Respond with a JSON object matching: ' +
      '{ body: string, evidenceFactIds: string[], warnings: string[] }',
    userContent: JSON.stringify({ profileFacts, approvedResume, job }),
    schema:      CoverLetterSchema,
  });
}
