import { describe, it, expect, vi } from 'vitest';
import { GreenhouseAdapter } from './greenhouse.adapter';
import { LeverAdapter } from './lever.adapter';
import { WorkplaceType } from '@prisma/client';

describe('Job Adapters - Greenhouse and Lever', () => {
  it('parses greenhouse jobs and cleans HTML tags', async () => {
    const mockJobsResponse = {
      jobs: [
        {
          id: 12345,
          title: 'Software Engineer - Graduate',
          location: { name: 'Hyderabad, India (Remote)' },
          absolute_url: 'https://boards.greenhouse.io/sample/jobs/12345',
          updated_at: '2026-10-15T10:00:00Z',
          content: '<p>Join our team as a <strong>software engineer</strong>.</p>',
        },
      ],
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJobsResponse,
    }) as any;

    try {
      const adapter = new GreenhouseAdapter();
      const jobs = await adapter.discover('sample-company');

      expect(jobs).toHaveLength(1);
      expect(jobs[0].company).toBe('sample-company');
      expect(jobs[0].title).toBe('Software Engineer - Graduate');
      expect(jobs[0].workplaceType).toBe(WorkplaceType.REMOTE);
      expect(jobs[0].descriptionText).not.toContain('<p>');
      expect(jobs[0].descriptionText).not.toContain('<strong>');
      expect(jobs[0].applyUrl).toBe('https://boards.greenhouse.io/sample/jobs/12345');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('parses lever postings correctly', async () => {
    const mockLeverResponse = [
      {
        id: 'lever-987',
        text: 'Graduate Electrical Engineer',
        categories: { location: 'Hyderabad', commitment: 'Full-time' },
        workplaceType: 'hybrid',
        hostedUrl: 'https://jobs.lever.co/sample/lever-987',
        applyUrl: 'https://jobs.lever.co/sample/lever-987/apply',
        descriptionPlain: 'Electrical design and testing role.',
        lists: [{ text: 'Requirements', content: 'B.Tech EEE' }],
        createdAt: 1729000000000,
      },
    ];

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLeverResponse,
    }) as any;

    try {
      const adapter = new LeverAdapter();
      const jobs = await adapter.discover('sample-company');

      expect(jobs).toHaveLength(1);
      expect(jobs[0].title).toBe('Graduate Electrical Engineer');
      expect(jobs[0].workplaceType).toBe(WorkplaceType.HYBRID);
      expect(jobs[0].employmentType).toBe('Full-time');
      expect(jobs[0].applyUrl).toBe('https://jobs.lever.co/sample/lever-987/apply');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
