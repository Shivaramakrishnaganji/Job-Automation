import { describe, it, expect } from 'vitest';
import { applyHardFilters, calculateDeterministicScore } from './matcher';
import { MatchTrack, WorkplaceType, JobVerificationStatus, ProfileFactCategory } from '@prisma/client';

describe('Job Matcher - Hard Filters & Deterministic Scoring', () => {
  const baseJob = {
    id: 'test-job-1',
    sourceId: null,
    sourceJobId: '101',
    company: 'TestCorp',
    title: 'Graduate Software Engineer',
    locationText: 'Hyderabad, Telangana, India',
    workplaceType: WorkplaceType.HYBRID,
    employmentType: 'Full-time',
    descriptionText: 'Looking for a fresher graduate software engineer with skills in Java, React, and SQL.',
    requirementsText: 'B.Tech graduates eligible.',
    salaryMin: 600000,
    salaryMax: 1000000,
    salaryCurrency: 'INR',
    postedAt: new Date(),
    firstSeenAt: new Date(),
    applyUrl: 'https://testcorp.com/apply/101',
    jobUrl: 'https://testcorp.com/jobs/101',
    sourceApiUrl: null,
    eligibilityNotesJson: [],
    isActive: true,
    verificationStatus: JobVerificationStatus.VERIFIED_OPEN,
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const basePreference: any = {
    id: 'pref-1',
    userId: 'user-1',
    name: 'Default',
    targetRolesJson: ['software engineer'],
    locationsJson: ['hyderabad', 'remote'],
    workModesJson: ['hybrid', 'remote'],
    employmentTypesJson: ['full-time'],
    minSalary: 500000,
    currency: 'INR',
    fresherOnly: true,
    requiredSkillsJson: [],
    excludedCompaniesJson: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('passes hard filter for suitable entry-level fresher job', () => {
    const res = applyHardFilters(baseJob, basePreference, 'B.Tech', 'EEE', 2027);
    expect(res.eligible).toBe('yes');
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it('rejects roles requiring 2+ years experience when fresherOnly is active', () => {
    const seniorJob = {
      ...baseJob,
      descriptionText: 'Requires at least 3 years of experience in distributed backend systems.',
    };
    const res = applyHardFilters(seniorJob, basePreference, 'B.Tech', 'EEE', 2027);
    expect(res.eligible).toBe('no');
    expect(res.reasons[0]).toContain('3+ years of experience');
  });

  it('flags warning when compensation is below user threshold', () => {
    const lowPayJob = {
      ...baseJob,
      salaryMax: 400000,
    };
    const res = applyHardFilters(lowPayJob, basePreference, 'B.Tech', 'EEE', 2027);
    expect(res.eligible).toBe('no');
    expect(res.reasons[0]).toContain('Compensation maximum');
  });

  it('computes explainable score with matched evidence IDs and track weights', () => {
    const facts: any[] = [
      {
        id: 'fact-react-1',
        userId: 'user-1',
        category: ProfileFactCategory.SKILL,
        label: 'React',
        valueJson: 'React',
        verifiedByUser: true,
      },
      {
        id: 'fact-java-1',
        userId: 'user-1',
        category: ProfileFactCategory.SKILL,
        label: 'Java',
        valueJson: 'Java',
        verifiedByUser: true,
      },
      {
        id: 'fact-edu-1',
        userId: 'user-1',
        category: ProfileFactCategory.EDUCATION,
        label: 'B.Tech EEE',
        valueJson: 'B.Tech in Electrical Engineering 2027',
        verifiedByUser: true,
      },
    ];

    const match = calculateDeterministicScore(baseJob, facts, MatchTrack.SOFTWARE_IT);

    expect(match.score).toBeGreaterThanOrEqual(60);
    expect(match.confidence).toBeDefined();
    expect(match.matchedEvidence.length).toBeGreaterThan(0);
    expect(match.matchedEvidence.some((e) => e.requirement === 'React')).toBe(true);
    expect(match.reasons.length).toBeGreaterThan(0);
  });
});
