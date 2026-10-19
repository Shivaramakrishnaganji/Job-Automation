import { WorkplaceType } from '@prisma/client';
import { NormalizedJob, JobSourceAdapter } from './greenhouse.adapter';

export class LeverAdapter implements JobSourceAdapter {
  name = 'lever';

  /**
   * Fetches public postings from Lever Postings API
   * Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
   */
  async discover(companyToken: string): Promise<NormalizedJob[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companyToken)}?mode=json`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Lever API error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];

    return data.map((item) => {
      const loc = item.categories?.location ?? null;
      let workplaceType: WorkplaceType = WorkplaceType.UNKNOWN;
      const workplaceField = item.workplaceType?.toLowerCase();
      if (workplaceField === 'remote' || (loc && /remote/i.test(loc))) {
        workplaceType = WorkplaceType.REMOTE;
      } else if (workplaceField === 'hybrid' || (loc && /hybrid/i.test(loc))) {
        workplaceType = WorkplaceType.HYBRID;
      } else if (loc) {
        workplaceType = WorkplaceType.ONSITE;
      }

      // Combine description and lists
      const descPlain = item.descriptionPlain || '';
      const additional = item.additionalPlain || '';
      const listsPlain = Array.isArray(item.lists)
        ? item.lists.map((l: any) => `${l.text || ''}\n${l.content || ''}`).join('\n')
        : '';
      const fullText = `${descPlain}\n${listsPlain}\n${additional}`.trim();

      return {
        source: this.name,
        sourceJobId: String(item.id),
        company: companyToken,
        title: item.text,
        locationText: loc,
        workplaceType,
        employmentType: item.categories?.commitment ?? null,
        descriptionText: fullText || item.text,
        requirementsText: listsPlain || null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
        firstSeenAt: new Date().toISOString(),
        applyUrl: item.applyUrl || item.hostedUrl,
        jobUrl: item.hostedUrl,
        sourceApiUrl: url,
        eligibilityNotes: [],
      };
    });
  }
}
