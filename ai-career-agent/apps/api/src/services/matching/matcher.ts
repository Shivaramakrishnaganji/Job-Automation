import { ProfileFact, SearchPreference, Job, MatchTrack } from '@prisma/client';

export interface HardFilterResult {
  eligible: 'yes' | 'likely' | 'unlikely' | 'no' | 'unknown';
  reasons: string[];
  warnings: string[];
}

export interface MatchScoreResult {
  score: number;
  confidence: 'high' | 'medium' | 'low';
  eligible: 'yes' | 'likely' | 'unlikely' | 'no' | 'unknown';
  matchedEvidence: Array<{
    requirement: string;
    profileFactIds: string[];
  }>;
  gaps: string[];
  reasons: string[];
  warnings: string[];
}

export const TRACK_WEIGHTS = {
  [MatchTrack.SOFTWARE_IT]: {
    skillsAndProjects: 30,
    seniorityFit: 20,
    degreeEligibility: 15,
    roleFamily: 15,
    locationFit: 10,
    compensationFit: 5,
    interestFit: 5,
  },
  [MatchTrack.CORE_EEE]: {
    skillsAndProjects: 25,
    seniorityFit: 20,
    degreeEligibility: 20,
    roleFamily: 15,
    locationFit: 10,
    compensationFit: 5,
    interestFit: 5,
  },
  [MatchTrack.BUSINESS_DATA_ANALYST]: {
    skillsAndProjects: 30,
    seniorityFit: 20,
    degreeEligibility: 15,
    roleFamily: 15,
    locationFit: 10,
    compensationFit: 5,
    interestFit: 5,
  },
};

/**
 * Deterministic Hard Eligibility Filters (runs before AI scoring)
 */
export function applyHardFilters(
  job: Job,
  preference?: SearchPreference | null,
  degree?: string | null,
  branch?: string | null,
  graduationYear?: number | null
): HardFilterResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const desc = (job.descriptionText + ' ' + (job.requirementsText || '')).toLowerCase();

  // 1. Fresher / Seniority Check
  const expMatch = desc.match(/(\d+)\+?\s*years?( of)? experience/i);
  if (expMatch) {
    const years = parseInt(expMatch[1], 10);
    if (years >= 2 && preference?.fresherOnly) {
      return {
        eligible: 'no',
        reasons: [`Requires ${years}+ years of experience, but fresher/entry-level filter is active.`],
        warnings: [],
      };
    }
    if (years === 1) {
      warnings.push('Requires 1 year of experience; may consider freshers with strong projects.');
    }
  }

  // 2. Degree / Graduation year check
  if (graduationYear && desc.includes('batch')) {
    const batchMatch = desc.match(/20\d{2}/g);
    if (batchMatch && !batchMatch.includes(String(graduationYear))) {
      warnings.push(`Mentioned batches (${batchMatch.join(', ')}) do not explicitly include your graduation year (${graduationYear}).`);
    }
  }

  // 3. Location check
  if (preference?.locationsJson && Array.isArray(preference.locationsJson)) {
    const targetLocations = (preference.locationsJson as string[]).map((l) => l.toLowerCase());
    const jobLoc = (job.locationText || '').toLowerCase();
    const isRemote = job.workplaceType === 'REMOTE' || jobLoc.includes('remote');

    const matchesLoc = targetLocations.some((loc) => jobLoc.includes(loc) || loc.includes('india'));
    if (!matchesLoc && !isRemote) {
      warnings.push(`Location "${job.locationText || 'Unspecified'}" is outside your primary target locations.`);
    }
  }

  // 4. Salary minimum check
  if (preference?.minSalary && job.salaryMax && job.salaryMax < preference.minSalary) {
    return {
      eligible: 'no',
      reasons: [`Compensation maximum (${job.salaryMax}) is below your minimum threshold (${preference.minSalary}).`],
      warnings,
    };
  }

  if (reasons.length > 0) {
    return { eligible: 'no', reasons, warnings };
  }

  return {
    eligible: warnings.length > 0 ? 'likely' : 'yes',
    reasons: ['Passed all deterministic eligibility checks.'],
    warnings,
  };
}

/**
 * Deterministic Fallback Match Scorer
 * Generates an explainable 0-100 score without requiring OpenAI if budget is tight.
 */
export function calculateDeterministicScore(
  job: Job,
  facts: ProfileFact[],
  track: MatchTrack = MatchTrack.SOFTWARE_IT
): MatchScoreResult {
  const desc = (job.title + ' ' + job.descriptionText + ' ' + (job.requirementsText || '')).toLowerCase();
  const matchedEvidence: Array<{ requirement: string; profileFactIds: string[] }> = [];
  const gaps: string[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];

  const weights = TRACK_WEIGHTS[track];
  let totalScore = 0;

  // 1. Evidence overlap
  const skillFacts = facts.filter((f) => f.category === 'SKILL');
  let matchedSkillsCount = 0;

  for (const sf of skillFacts) {
    const val = typeof sf.valueJson === 'string' ? sf.valueJson : (sf.valueJson as any)?.name || sf.label;
    if (val && desc.includes(String(val).toLowerCase())) {
      matchedSkillsCount++;
      matchedEvidence.push({
        requirement: String(val),
        profileFactIds: [sf.id],
      });
    }
  }

  const skillScoreFraction = skillFacts.length > 0 ? Math.min(1, matchedSkillsCount / Math.max(3, skillFacts.length * 0.5)) : 0.5;
  const skillPoints = Math.round(skillScoreFraction * weights.skillsAndProjects);
  totalScore += skillPoints;

  if (matchedSkillsCount > 0) {
    reasons.push(`Matched ${matchedSkillsCount} verified skills directly with job description.`);
  } else {
    gaps.push('Key technical skills from your profile were not explicitly found in the job text.');
  }

  // 2. Seniority & Fresher Fit
  const isFresherTitle = /graduate|trainee|fresher|entry|junior|associate|intern/i.test(job.title);
  if (isFresherTitle) {
    totalScore += weights.seniorityFit;
    reasons.push('Title explicitly targets graduate/fresher/entry-level candidates.');
  } else {
    totalScore += Math.round(weights.seniorityFit * 0.6);
  }

  // 3. Degree & Branch eligibility
  const degreeFacts = facts.filter((f) => f.category === 'EDUCATION');
  if (degreeFacts.length > 0) {
    totalScore += weights.degreeEligibility;
    reasons.push('Education background registered.');
  } else {
    totalScore += Math.round(weights.degreeEligibility * 0.5);
    warnings.push('Confirm degree details in candidate profile for higher score confidence.');
  }

  // 4. Role family & keywords
  let rolePoints = 0;
  if (track === MatchTrack.SOFTWARE_IT && /software|developer|engineer|fullstack|backend|frontend/i.test(job.title)) {
    rolePoints = weights.roleFamily;
  } else if (track === MatchTrack.CORE_EEE && /electrical|power|circuit|embedded|hardware/i.test(job.title)) {
    rolePoints = weights.roleFamily;
  } else if (track === MatchTrack.BUSINESS_DATA_ANALYST && /analyst|data|business|reporting|bi/i.test(job.title)) {
    rolePoints = weights.roleFamily;
  } else {
    rolePoints = Math.round(weights.roleFamily * 0.5);
  }
  totalScore += rolePoints;

  // 5. Location / workplace
  if (job.workplaceType === 'REMOTE' || (job.locationText && /hyderabad|telangana|remote|india/i.test(job.locationText))) {
    totalScore += weights.locationFit;
    reasons.push(`Location matches preferred region: ${job.locationText || 'Remote'}`);
  } else {
    totalScore += Math.round(weights.locationFit * 0.5);
  }

  // 6. Base interest fit
  totalScore += weights.interestFit;

  // Cap total score at 100
  const finalScore = Math.min(100, Math.max(0, totalScore));

  return {
    score: finalScore,
    confidence: matchedEvidence.length >= 3 ? 'high' : 'medium',
    eligible: finalScore >= 60 ? 'likely' : 'unlikely',
    matchedEvidence,
    gaps,
    reasons,
    warnings: job.salaryMin ? warnings : [...warnings, 'Compensation was not disclosed by the employer.'],
  };
}
