export interface ColumnMapping {
  company?: string;
  title?: string;
  location?: string;
  applyUrl?: string;
  deadline?: string;
  source?: string;
  status?: string;
  notes?: string;
}

export interface NormalizedImportRow {
  company?: string;
  title?: string;
  location?: string;
  applyUrl?: string;
  deadline?: string;
  source?: string;
  status?: string;
  notes?: string;
}

export interface RowValidationResult {
  rowIndex: number;
  sheetName: string;
  rawRow: Record<string, unknown>;
  status: 'VALID' | 'INVALID' | 'DUPLICATE';
  errors: string[];
  normalized: NormalizedImportRow | null;
}

/**
 * Validates and maps spreadsheet rows according to user's column mapping.
 * Never commits unclear mappings silently.
 */
export function validateAndNormalizeRows(
  rows: Record<string, unknown>[],
  sheetName: string,
  mapping: ColumnMapping,
  existingUrls: Set<string>
): RowValidationResult[] {
  return rows.map((row, idx) => {
    const errors: string[] = [];
    const normalized: NormalizedImportRow = {};

    if (mapping.company && row[mapping.company] !== undefined && row[mapping.company] !== null) {
      normalized.company = String(row[mapping.company]).trim();
    }
    if (mapping.title && row[mapping.title] !== undefined && row[mapping.title] !== null) {
      normalized.title = String(row[mapping.title]).trim();
    }
    if (mapping.location && row[mapping.location] !== undefined && row[mapping.location] !== null) {
      normalized.location = String(row[mapping.location]).trim();
    }
    if (mapping.deadline && row[mapping.deadline] !== undefined && row[mapping.deadline] !== null) {
      normalized.deadline = String(row[mapping.deadline]).trim();
    }
    if (mapping.source && row[mapping.source] !== undefined && row[mapping.source] !== null) {
      normalized.source = String(row[mapping.source]).trim();
    }
    if (mapping.status && row[mapping.status] !== undefined && row[mapping.status] !== null) {
      normalized.status = String(row[mapping.status]).trim();
    }
    if (mapping.notes && row[mapping.notes] !== undefined && row[mapping.notes] !== null) {
      normalized.notes = String(row[mapping.notes]).trim();
    }

    if (mapping.applyUrl && row[mapping.applyUrl] !== undefined && row[mapping.applyUrl] !== null) {
      const rawUrl = String(row[mapping.applyUrl]).trim();
      if (rawUrl) {
        try {
          // Check if valid URL
          const parsed = new URL(rawUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.push(`URL must use http or https: "${rawUrl}"`);
          } else {
            normalized.applyUrl = rawUrl;
          }
        } catch {
          errors.push(`Invalid URL format: "${rawUrl}"`);
        }
      }
    }

    // Row must have at least company or title
    if (!normalized.company && !normalized.title) {
      errors.push('Row is missing both company name and job title');
    }

    // Check duplicate URL
    if (normalized.applyUrl && existingUrls.has(normalized.applyUrl)) {
      return {
        rowIndex: idx + 2, // 1-indexed, account for header row
        sheetName,
        rawRow: row,
        status: 'DUPLICATE',
        errors: ['Duplicate apply URL already exists in database'],
        normalized,
      };
    }

    return {
      rowIndex: idx + 2,
      sheetName,
      rawRow: row,
      status: errors.length > 0 ? 'INVALID' : 'VALID',
      errors,
      normalized: errors.length > 0 ? null : normalized,
    };
  });
}
