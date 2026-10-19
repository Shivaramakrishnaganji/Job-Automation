import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import fs from 'fs';
import { ResourceType, ProcessingStatus, ImportStatus, ValidationStatus, WorkplaceType } from '@prisma/client';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { logAudit } from '../lib/auditLogger';
import { resourceUpload, computeFileHash } from '../services/resources/resource-storage';
import {
  parseSpreadsheet,
  extractTextFromPDF,
  extractTextFromDOCX,
  detectResourceType,
} from '../services/resources/file-parser';
import { validateAndNormalizeRows, ColumnMapping } from '../services/resources/row-validator';
import { indexDocumentChunks, ChunkToIndex, getQdrantStatus } from '../services/ai/qdrant.service';

function createChunksFromText(text: string, filename: string, category: string): ChunkToIndex[] {
  const chunks: ChunkToIndex[] = [];
  const chunkSize = 600;
  const overlap = 100;
  let i = 0;
  let chunkIdx = 0;
  while (i < text.length) {
    const chunkText = text.slice(i, i + chunkSize).trim();
    if (chunkText.length > 25) {
      chunks.push({
        chunkIndex: chunkIdx++,
        text: chunkText,
        metadata: { filename, category },
      });
    }
    i += chunkSize - overlap;
  }
  return chunks;
}

const router = Router();
router.use(requireAuth);

// ─── POST /resources/upload ───────────────────────────────────────────────────

router.post(
  '/upload',
  resourceUpload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.session.userId!;
      if (!req.file) {
        res.status(400).json({ error: 'Bad request', message: 'No file uploaded or file type not allowed.' });
        return;
      }

      const { path: filePath, originalname, mimetype } = req.file;
      const contentHash = computeFileHash(filePath);

      // Check if duplicate file already uploaded by this user
      const existing = await prisma.resourceFile.findFirst({
        where: { userId, contentHash, isActive: true },
      });

      if (existing) {
        res.status(200).json({
          resourceId: existing.id,
          filename: existing.originalFilename,
          mimeType: existing.mimeType,
          resourceType: existing.resourceType,
          processingStatus: existing.processingStatus,
          isDuplicate: true,
          message: 'Identical file already exists. Reusing existing resource record.',
        });
        return;
      }

      const resource = await prisma.resourceFile.create({
        data: {
          userId,
          originalFilename: originalname,
          mimeType: mimetype,
          storagePath: filePath,
          contentHash,
          resourceType: ResourceType.GENERAL_REFERENCE,
          processingStatus: ProcessingStatus.PENDING,
        },
      });

      await logAudit({
        userId,
        action: 'RESOURCE_UPLOAD',
        entityType: 'ResourceFile',
        entityId: resource.id,
        metadata: { filename: originalname, mimeType: mimetype },
      });

      res.status(201).json({
        resourceId: resource.id,
        filename: resource.originalFilename,
        mimeType: resource.mimeType,
        processingStatus: resource.processingStatus,
        message: 'File uploaded. Call /process to inspect worksheets and headers.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /resources ───────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const resources = await prisma.resourceFile.findMany({
      where: { userId, isActive: true },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        resourceType: true,
        processingStatus: true,
        uploadedAt: true,
        processedAt: true,
        errorSummary: true,
      },
    });

    res.status(200).json({ resources });
  } catch (err) {
    next(err);
  }
});

// ─── GET /resources/:resourceId ───────────────────────────────────────────────

router.get('/:resourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;

    const resource = await prisma.resourceFile.findUnique({
      where: { id: resourceId },
      include: {
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    res.status(200).json(resource);
  } catch (err) {
    next(err);
  }
});

// ─── POST /resources/:resourceId/process ──────────────────────────────────────

router.post('/:resourceId/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;

    const resource = await prisma.resourceFile.findUnique({ where: { id: resourceId } });
    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    const { storagePath, mimeType, originalFilename } = resource;
    if (!fs.existsSync(storagePath)) {
      res.status(404).json({ error: 'File error', message: 'Stored file is missing on server.' });
      return;
    }

    // Process depending on file type
    const isSpreadsheet =
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('csv') ||
      originalFilename.endsWith('.csv') ||
      originalFilename.endsWith('.xlsx') ||
      originalFilename.endsWith('.xls');

    if (isSpreadsheet) {
      const data = await parseSpreadsheet(storagePath);
      const allHeaders = data.sheets.flatMap((s) => s.headers);
      const suggestedType = detectResourceType(originalFilename, allHeaders);

      await prisma.resourceFile.update({
        where: { id: resourceId },
        data: {
          processingStatus: ProcessingStatus.DONE,
          processedAt: new Date(),
          resourceType: suggestedType,
        },
      });

      res.status(200).json({
        type: 'spreadsheet',
        sheets: data.sheets,
        totalRows: data.totalRows,
        suggestedResourceType: suggestedType,
      });
      return;
    }

    if (mimeType.includes('pdf')) {
      const text = await extractTextFromPDF(storagePath);
      const suggestedType = detectResourceType(originalFilename, []);

      // Chunk and index into Qdrant Vector DB & PostgreSQL
      const chunks = createChunksFromText(text, originalFilename, suggestedType);
      const qdrantResult = await indexDocumentChunks({
        userId,
        resourceFileId: resourceId,
        filename: originalFilename,
        chunks,
      });

      await prisma.resourceFile.update({
        where: { id: resourceId },
        data: {
          processingStatus: ProcessingStatus.DONE,
          processedAt: new Date(),
          resourceType: suggestedType,
        },
      });

      res.status(200).json({
        type: 'document',
        charCount: text.length,
        chunksIndexed: chunks.length,
        indexedInQdrant: qdrantResult.indexedInQdrant,
        textPreview: text.slice(0, 1000),
        suggestedResourceType: suggestedType,
      });
      return;
    }

    if (mimeType.includes('word') || originalFilename.endsWith('.docx')) {
      const text = await extractTextFromDOCX(storagePath);
      const suggestedType = detectResourceType(originalFilename, []);

      // Chunk and index into Qdrant Vector DB & PostgreSQL
      const chunks = createChunksFromText(text, originalFilename, suggestedType);
      const qdrantResult = await indexDocumentChunks({
        userId,
        resourceFileId: resourceId,
        filename: originalFilename,
        chunks,
      });

      await prisma.resourceFile.update({
        where: { id: resourceId },
        data: {
          processingStatus: ProcessingStatus.DONE,
          processedAt: new Date(),
          resourceType: suggestedType,
        },
      });

      res.status(200).json({
        type: 'document',
        charCount: text.length,
        chunksIndexed: chunks.length,
        indexedInQdrant: qdrantResult.indexedInQdrant,
        textPreview: text.slice(0, 1000),
        suggestedResourceType: suggestedType,
      });
      return;
    }

    // Default text/markdown
    const text = fs.readFileSync(storagePath, 'utf-8');
    const chunks = createChunksFromText(text, originalFilename, ResourceType.GENERAL_REFERENCE);
    const qdrantResult = await indexDocumentChunks({
      userId,
      resourceFileId: resourceId,
      filename: originalFilename,
      chunks,
    });

    await prisma.resourceFile.update({
      where: { id: resourceId },
      data: {
        processingStatus: ProcessingStatus.DONE,
        processedAt: new Date(),
      },
    });

    res.status(200).json({
      type: 'text',
      charCount: text.length,
      chunksIndexed: chunks.length,
      indexedInQdrant: qdrantResult.indexedInQdrant,
      textPreview: text.slice(0, 1000),
      suggestedResourceType: ResourceType.GENERAL_REFERENCE,
    });
  } catch (err: any) {
    await prisma.resourceFile.update({
      where: { id: req.params.resourceId },
      data: {
        processingStatus: ProcessingStatus.FAILED,
        errorSummary: err.message || 'Unknown processing error',
      },
    }).catch(() => {});
    next(err);
  }
});

// ─── GET /resources/:resourceId/preview ───────────────────────────────────────

router.get('/:resourceId/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;

    const resource = await prisma.resourceFile.findUnique({ where: { id: resourceId } });
    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    const { storagePath, mimeType, originalFilename } = resource;
    const isSpreadsheet =
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('csv') ||
      originalFilename.endsWith('.csv') ||
      originalFilename.endsWith('.xlsx');

    if (isSpreadsheet) {
      const data = await parseSpreadsheet(storagePath);
      res.status(200).json({ sheets: data.sheets });
      return;
    }

    const text = fs.readFileSync(storagePath, 'utf-8').slice(0, 2000);
    res.status(200).json({ previewText: text });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /resources/:resourceId/mapping ─────────────────────────────────────

const mappingSchema = z.object({
  selectedSheet: z.string().min(1),
  columnMapping: z.object({
    company: z.string().optional(),
    title: z.string().optional(),
    location: z.string().optional(),
    applyUrl: z.string().optional(),
    deadline: z.string().optional(),
    source: z.string().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),
});

router.patch('/:resourceId/mapping', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;

    const parsed = mappingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
      return;
    }

    const resource = await prisma.resourceFile.findUnique({ where: { id: resourceId } });
    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    const { selectedSheet, columnMapping } = parsed.data;
    const workbookData = await parseSpreadsheet(resource.storagePath);
    const targetSheet = workbookData.sheets.find((s) => s.name === selectedSheet);

    if (!targetSheet) {
      res.status(400).json({ error: 'Bad request', message: `Sheet "${selectedSheet}" not found.` });
      return;
    }

    // Get all rows for validation
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(resource.storagePath, { cellFormula: false });
    const ws = workbook.Sheets[selectedSheet];
    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false });

    // Existing URLs in DB for deduplication
    const existingJobs = await prisma.job.findMany({ select: { applyUrl: true } });
    const existingUrls = new Set(existingJobs.map((j) => j.applyUrl));

    const validationResults = validateAndNormalizeRows(allRows, selectedSheet, columnMapping, existingUrls);

    const validCount = validationResults.filter((r) => r.status === 'VALID').length;
    const invalidCount = validationResults.filter((r) => r.status === 'INVALID').length;
    const duplicateCount = validationResults.filter((r) => r.status === 'DUPLICATE').length;

    // Create a ResourceImportBatch record
    const batch = await prisma.resourceImportBatch.create({
      data: {
        userId,
        resourceFileId: resourceId,
        selectedSheetsJson: [selectedSheet],
        columnMappingJson: columnMapping,
        importStatus: ImportStatus.PENDING,
        rowsSeen: allRows.length,
        rowsSkipped: duplicateCount,
        rowsFailed: invalidCount,
      },
    });

    // Save rows into resource_import_rows for preview and error reporting
    for (const item of validationResults) {
      await prisma.resourceImportRow.create({
        data: {
          batchId: batch.id,
          sheetName: item.sheetName,
          sourceRowNumber: item.rowIndex,
          rawRowJson: item.rawRow as any,
          normalizedRecordJson: (item.normalized as any) ?? {},
          validationStatus: item.status as ValidationStatus,
          validationErrorsJson: item.errors,
        },
      });
    }

    res.status(200).json({
      batchId: batch.id,
      totalRows: allRows.length,
      validRows: validCount,
      invalidRows: invalidCount,
      duplicateRows: duplicateCount,
      preview: validationResults.slice(0, 10).map((r) => ({
        row: r.rowIndex,
        status: r.status,
        errors: r.errors,
        data: r.normalized,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /resources/:resourceId/confirm-import ───────────────────────────────

router.post('/:resourceId/confirm-import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;
    const { batchId } = req.body;

    if (!batchId) {
      res.status(400).json({ error: 'Bad request', message: 'batchId is required.' });
      return;
    }

    const batch = await prisma.resourceImportBatch.findUnique({
      where: { id: batchId },
      include: { resourceFile: true },
    });

    if (!batch || batch.userId !== userId || batch.resourceFileId !== resourceId) {
      res.status(404).json({ error: 'Not found', message: 'Import batch not found.' });
      return;
    }

    // Idempotency check: if already imported, return previous results
    if (batch.importStatus === ImportStatus.DONE) {
      res.status(200).json({
        batchId: batch.id,
        alreadyImported: true,
        rowsImported: batch.rowsImported,
        rowsSkipped: batch.rowsSkipped,
        rowsFailed: batch.rowsFailed,
        message: 'Batch was already imported previously.',
      });
      return;
    }

    await prisma.resourceImportBatch.update({
      where: { id: batchId },
      data: { importStatus: ImportStatus.IMPORTING },
    });

    // Fetch valid rows from batch
    const validImportRows = await prisma.resourceImportRow.findMany({
      where: { batchId, validationStatus: ValidationStatus.VALID },
    });

    let importedCount = 0;

    for (const r of validImportRows) {
      const norm = (r.normalizedRecordJson as ColumnMapping) || {};
      const company = norm.company || 'Unknown Company';
      const title = norm.title || 'Untitled Role';
      const applyUrl = norm.applyUrl || `https://imported-resource.internal/row-${r.id}`;

      // Insert Job record
      const job = await prisma.job.create({
        data: {
          company,
          title,
          locationText: norm.location ?? null,
          workplaceType: WorkplaceType.UNKNOWN,
          descriptionText: `Imported from ${batch.resourceFile.originalFilename} (Sheet: ${r.sheetName}, Row: ${r.sourceRowNumber}). Notes: ${norm.notes ?? 'None'}`,
          applyUrl,
          jobUrl: applyUrl,
          verificationStatus: norm.applyUrl ? 'NEEDS_VERIFICATION' : 'UNKNOWN',
        },
      });

      // Update import row with target record id
      await prisma.resourceImportRow.update({
        where: { id: r.id },
        data: { targetRecordType: 'Job', targetRecordId: job.id },
      });

      importedCount++;
    }

    await prisma.resourceImportBatch.update({
      where: { id: batchId },
      data: {
        importStatus: ImportStatus.DONE,
        confirmedAt: new Date(),
        rowsImported: importedCount,
      },
    });

    await logAudit({
      userId,
      action: 'RESOURCE_IMPORT_CONFIRMED',
      entityType: 'ResourceImportBatch',
      entityId: batch.id,
      metadata: { importedCount, filename: batch.resourceFile.originalFilename },
    });

    res.status(200).json({
      batchId: batch.id,
      rowsImported: importedCount,
      rowsSkipped: batch.rowsSkipped,
      rowsFailed: batch.rowsFailed,
      message: `Successfully imported ${importedCount} records.`,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /resources/import-batches/:batchId/errors ─────────────────────────────

router.get('/import-batches/:batchId/errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { batchId } = req.params;

    const batch = await prisma.resourceImportBatch.findUnique({
      where: { id: batchId },
      include: { resourceFile: true },
    });

    if (!batch || batch.userId !== userId) {
      res.status(404).json({ error: 'Not found', message: 'Batch not found.' });
      return;
    }

    const invalidRows = await prisma.resourceImportRow.findMany({
      where: { batchId, validationStatus: ValidationStatus.INVALID },
      orderBy: { sourceRowNumber: 'asc' },
    });

    res.status(200).json({
      batchId,
      filename: batch.resourceFile.originalFilename,
      count: invalidRows.length,
      errors: invalidRows.map((r) => ({
        rowNumber: r.sourceRowNumber,
        sheet: r.sheetName,
        validationErrors: r.validationErrorsJson,
        rawRow: r.rawRowJson,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /resources/:resourceId/type ────────────────────────────────────────

router.patch('/:resourceId/type', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;
    const { resourceType } = req.body;

    if (!resourceType || !Object.values(ResourceType).includes(resourceType)) {
      res.status(400).json({ error: 'Validation error', message: 'Invalid resourceType' });
      return;
    }

    const resource = await prisma.resourceFile.findUnique({ where: { id: resourceId } });
    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    const updated = await prisma.resourceFile.update({
      where: { id: resourceId },
      data: { resourceType },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /resources/:resourceId ────────────────────────────────────────────

router.delete('/:resourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.session.userId!;
    const { resourceId } = req.params;

    const resource = await prisma.resourceFile.findUnique({ where: { id: resourceId } });
    if (!resource || resource.userId !== userId || !resource.isActive) {
      res.status(404).json({ error: 'Not found', message: 'Resource not found' });
      return;
    }

    await prisma.resourceFile.update({
      where: { id: resourceId },
      data: { isActive: false },
    });

    await logAudit({
      userId,
      action: 'RESOURCE_DELETE',
      entityType: 'ResourceFile',
      entityId: resourceId,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── GET /resources/qdrant-status ─────────────────────────────────────────────

router.get('/qdrant-status', async (_req: Request, res: Response) => {
  const status = await getQdrantStatus();
  res.status(200).json(status);
});

export default router;
