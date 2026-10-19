import * as XLSX from 'xlsx';
import fs from 'fs';
import { ResourceType } from '@prisma/client';

export interface SpreadsheetSheet {
  name: string;
  headers: string[];
  rowCount: number;
  previewRows: Record<string, unknown>[];
}

export interface SpreadsheetData {
  sheets: SpreadsheetSheet[];
  totalRows: number;
}

/**
 * Safely parse an Excel/CSV file without executing macros or spreadsheet formulas.
 * Uses cached formula values only.
 */
export async function parseSpreadsheet(filePath: string): Promise<SpreadsheetData> {
  const workbook = XLSX.readFile(filePath, {
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellText: true,
  });

  const sheets: SpreadsheetSheet[] = workbook.SheetNames.map((name) => {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: null,
      raw: false,
    });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      name,
      headers,
      rowCount: rows.length,
      previewRows: rows.slice(0, 5),
    };
  });

  return {
    sheets,
    totalRows: sheets.reduce((sum, s) => sum + s.rowCount, 0),
  };
}

/**
 * Extract plain text from PDF using pdf-parse.
 */
export async function extractTextFromPDF(filePath: string): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text || '';
}

/**
 * Extract plain text from DOCX using mammoth.
 */
export async function extractTextFromDOCX(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

/**
 * Propose a default ResourceType based on filename and column headers.
 */
export function detectResourceType(filename: string, headers: string[]): ResourceType {
  const lowerName = filename.toLowerCase();
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  if (
    lowerHeaders.some((h) => h.includes('apply') || h.includes('job url') || h.includes('role') || h.includes('position'))
  ) {
    return ResourceType.JOB_OPENINGS;
  }

  if (
    lowerHeaders.some((h) => h.includes('company')) &&
    !lowerHeaders.some((h) => h.includes('job') || h.includes('role') || h.includes('url'))
  ) {
    return ResourceType.COMPANY_TARGETS;
  }

  if (
    lowerHeaders.some(
      (h) => h.includes('recruiter') || h.includes('hr') || h.includes('contact') || h.includes('linkedin')
    )
  ) {
    return ResourceType.CONTACTS;
  }

  if (
    lowerHeaders.some((h) => h.includes('status') || h.includes('applied') || h.includes('stage'))
  ) {
    return ResourceType.APPLICATION_TRACKER;
  }

  if (
    lowerName.includes('resume') ||
    lowerName.includes('cv') ||
    lowerName.includes('profile') ||
    lowerName.includes('certificate')
  ) {
    return ResourceType.CANDIDATE_EVIDENCE;
  }

  if (
    lowerName.includes('eligib') ||
    lowerName.includes('criteria') ||
    lowerName.includes('placement') ||
    lowerName.includes('notice')
  ) {
    return ResourceType.ELIGIBILITY_REFERENCE;
  }

  if (lowerName.includes('interview') || lowerName.includes('prep') || lowerName.includes('question')) {
    return ResourceType.INTERVIEW_PREP;
  }

  return ResourceType.GENERAL_REFERENCE;
}
