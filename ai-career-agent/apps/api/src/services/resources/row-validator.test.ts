import { describe, it, expect } from 'vitest';
import { validateAndNormalizeRows } from './row-validator';

describe('Resource Row Validator', () => {
  const mapping = {
    company: 'Company Name',
    title: 'Designation',
    location: 'City',
    applyUrl: 'Portal Link',
    notes: 'CTC',
  };

  const existingUrls = new Set<string>(['https://example.com/apply/dup']);

  it('validates and normalizes valid spreadsheet rows', () => {
    const rawRows = [
      {
        'Company Name': 'Stripe',
        Designation: 'Backend Engineer',
        City: 'Hyderabad',
        'Portal Link': 'https://stripe.com/apply/123',
        CTC: '20 LPA',
      },
    ];

    const results = validateAndNormalizeRows(rawRows, 'Sheet1', mapping, existingUrls);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('VALID');
    expect(results[0].normalized?.company).toBe('Stripe');
    expect(results[0].normalized?.title).toBe('Backend Engineer');
    expect(results[0].normalized?.applyUrl).toBe('https://stripe.com/apply/123');
  });

  it('marks rows with invalid URLs as INVALID', () => {
    const rawRows = [
      {
        'Company Name': 'Google',
        Designation: 'SWE',
        'Portal Link': 'not-a-valid-url',
      },
    ];

    const results = validateAndNormalizeRows(rawRows, 'Sheet1', mapping, existingUrls);
    expect(results[0].status).toBe('INVALID');
    expect(results[0].errors[0]).toContain('Invalid URL format');
  });

  it('flags rows with duplicate applyUrl already in DB as DUPLICATE', () => {
    const rawRows = [
      {
        'Company Name': 'DupCorp',
        Designation: 'Analyst',
        'Portal Link': 'https://example.com/apply/dup',
      },
    ];

    const results = validateAndNormalizeRows(rawRows, 'Sheet1', mapping, existingUrls);
    expect(results[0].status).toBe('DUPLICATE');
  });

  it('rejects rows missing both company and title', () => {
    const rawRows = [
      {
        'Company Name': '',
        Designation: '',
        City: 'Hyderabad',
      },
    ];

    const results = validateAndNormalizeRows(rawRows, 'Sheet1', mapping, existingUrls);
    expect(results[0].status).toBe('INVALID');
    expect(results[0].errors[0]).toContain('missing both company name and job title');
  });
});
