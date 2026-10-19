import { WorkplaceType } from '@prisma/client';

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  company: string;
  title: string;
  locationText: string | null;
  workplaceType: WorkplaceType;
  employmentType: string | null;
  descriptionText: string;
  requirementsText: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  applyUrl: string;
  jobUrl: string;
  sourceApiUrl: string | null;
  eligibilityNotes: string[];
}

export interface JobSourceAdapter {
  name: string;
  discover(companyToken: string): Promise<NormalizedJob[]>;
  getJob?(companyToken: string, sourceJobId: string): Promise<NormalizedJob | null>;
}

export class GreenhouseAdapter implements JobSourceAdapter {
  name = 'greenhouse';

  /**
   * Fetches public jobs from Greenhouse Job Board API
   * Endpoint: https://boards-api.greenhouse.io/v1/boards/{companyToken}/jobs?content=true
   */
  async discover(companyToken: string): Promise<NormalizedJob[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(companyToken)}/jobs?content=true`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Greenhouse API error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { jobs: any[] };
    if (!data.jobs || !Array.isArray(data.jobs)) return [];

    return data.jobs.map((item) => {
      const loc = item.location?.name ?? null;
      let workplaceType: WorkplaceType = WorkplaceType.UNKNOWN;
      if (loc && /remote/i.test(loc)) workplaceType = WorkplaceType.REMOTE;
      else if (loc && /hybrid/i.test(loc)) workplaceType = WorkplaceType.HYBRID;
      else if (loc) workplaceType = WorkplaceType.ONSITE;

      // Clean HTML tags from content
      const rawHtml = item.content || '';
      const cleanText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      return {
        source: this.name,
        sourceJobId: String(item.id),
        company: companyToken,
        title: item.title,
        locationText: loc,
        workplaceType,
        employmentType: null,
        descriptionText: cleanText || item.title,
        requirementsText: null,
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        postedAt: item.updated_at ?? null,
        firstSeenAt: new Date().toISOString(),
        applyUrl: item.absolute_url,
        jobUrl: item.absolute_url,
        sourceApiUrl: url,
        eligibilityNotes: [],
      };
    });
  }
}
