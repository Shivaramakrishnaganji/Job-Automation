/**
 * ATS-Friendly Single-Column PDF Resume Generator.
 * Generates valid PDF 1.4 documents with clean text streams and zero external runtime dependencies.
 * Spec-compliant for ATS parsers (Greenhouse, Lever, Workday).
 */

export interface ResumePdfData {
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  country?: string;
  headline?: string;
  summary?: string;
  degree?: string;
  branch?: string;
  graduationYear?: number;
  skills: string[];
  experienceBullets: string[];
  projectBullets: string[];
  jobTitle?: string;
  companyName?: string;
}

export function generateAtsResumePdf(data: ResumePdfData): Buffer {
  const lines: string[] = [];
  const sanitize = (text: string) =>
    (text || '').replace(/[\\()]/g, '').replace(/[^\x20-\x7E\t\r\n]/g, ' ');

  // Document structure
  const chunks: string[] = [];
  let objectCount = 0;
  const offsets: number[] = [];

  function addObject(content: string): number {
    objectCount++;
    offsets.push(chunks.join('').length);
    chunks.push(`${objectCount} 0 obj\n${content}\nendobj\n`);
    return objectCount;
  }

  // Header
  chunks.push('%PDF-1.4\n');

  // Page dimensions (US Letter: 612 x 792 points)
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const printableWidth = pageWidth - margin * 2;

  // Build stream content
  let streamText = '';
  let y = pageHeight - margin - 20;

  function writeHeading(text: string, size = 16) {
    streamText += `BT /F2 ${size} Tf ${margin} ${y} Td (${sanitize(text)}) Tj ET\n`;
    y -= size + 6;
  }

  function writeSubheading(text: string, size = 10) {
    streamText += `BT /F1 ${size} Tf ${margin} ${y} Td (${sanitize(text)}) Tj ET\n`;
    y -= size + 12;
  }

  function writeSectionHeader(title: string) {
    y -= 6;
    streamText += `BT /F2 11 Tf ${margin} ${y} Td (${sanitize(title.toUpperCase())}) Tj ET\n`;
    y -= 4;
    // Draw divider line
    streamText += `${margin} ${y} m ${pageWidth - margin} ${y} l 0.75 w 0.2 0.2 0.2 RG S\n`;
    y -= 12;
  }

  function writeParagraph(text: string, size = 9.5) {
    const words = sanitize(text).split(' ');
    let currentLine = '';
    const maxCharsPerLine = 92;

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxCharsPerLine) {
        streamText += `BT /F1 ${size} Tf ${margin} ${y} Td (${currentLine.trim()}) Tj ET\n`;
        y -= size + 3;
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }
    if (currentLine.trim()) {
      streamText += `BT /F1 ${size} Tf ${margin} ${y} Td (${currentLine.trim()}) Tj ET\n`;
      y -= size + 8;
    }
  }

  function writeBullet(text: string, size = 9) {
    const words = sanitize(text).split(' ');
    let currentLine = '';
    const maxChars = 86;
    const bulletIndent = margin + 14;

    streamText += `BT /F2 ${size} Tf ${margin + 4} ${y} Td (-) Tj ET\n`;

    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length > maxChars) {
        streamText += `BT /F1 ${size} Tf ${bulletIndent} ${y} Td (${currentLine.trim()}) Tj ET\n`;
        y -= size + 3;
        currentLine = word;
      } else {
        currentLine += (currentLine ? ' ' : '') + word;
      }
    }
    if (currentLine.trim()) {
      streamText += `BT /F1 ${size} Tf ${bulletIndent} ${y} Td (${currentLine.trim()}) Tj ET\n`;
      y -= size + 5;
    }
  }

  // 1. Candidate Name & Contact
  writeHeading(data.fullName || 'Candidate Name', 18);

  const contactParts = [
    data.email,
    data.phone,
    [data.city, data.country].filter(Boolean).join(', '),
  ].filter(Boolean);
  writeSubheading(contactParts.join('  |  '), 9);

  if (data.headline) {
    writeSubheading(data.headline, 9.5);
  }

  // 2. Professional Summary
  if (data.summary) {
    writeSectionHeader('Professional Summary');
    writeParagraph(data.summary);
  }

  // 3. Relevant Skills (ATS keyword matching)
  if (data.skills && data.skills.length > 0) {
    writeSectionHeader('Key Competencies & Technical Skills');
    writeParagraph(data.skills.join('  •  '));
  }

  // 4. Tailored Experience & Accomplishments
  if (data.experienceBullets && data.experienceBullets.length > 0) {
    writeSectionHeader('Professional Experience & Achievements');
    for (const b of data.experienceBullets) {
      writeBullet(b);
    }
  }

  // 5. Tailored Projects & Evidence
  if (data.projectBullets && data.projectBullets.length > 0) {
    writeSectionHeader('Featured Projects & Applied Engineering');
    for (const p of data.projectBullets) {
      writeBullet(p);
    }
  }

  // 6. Education
  if (data.degree || data.branch) {
    writeSectionHeader('Education & Credentials');
    const eduLine = [data.degree, data.branch, data.graduationYear ? `Graduation ${data.graduationYear}` : null]
      .filter(Boolean)
      .join(' — ');
    writeParagraph(eduLine);
  }

  // PDF Object 1: Catalog
  addObject('<< /Type /Catalog /Pages 2 0 R >>');

  // PDF Object 2: Pages
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  // PDF Object 3: Page
  addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`
  );

  // PDF Object 4: Stream Content
  addObject(`<< /Length ${Buffer.byteLength(streamText, 'utf-8')} >>\nstream\n${streamText}\nendstream`);

  // PDF Object 5: Standard Font (Helvetica)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // PDF Object 6: Bold Font (Helvetica-Bold)
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  // Cross-reference table
  const startXref = chunks.join('').length;
  let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  chunks.push(xref);
  chunks.push(trailer);

  return Buffer.from(chunks.join(''), 'utf-8');
}
