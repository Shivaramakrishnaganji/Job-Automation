import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const PRIVATE_FILES_DIR = process.env.PRIVATE_FILES_DIR ?? './private-files';

export function getResourceDir(userId: string): string {
  const dir = path.join(PRIVATE_FILES_DIR, 'resources', userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'text/csv',
  'application/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'text/plain',
  'text/markdown',
];

export const resourceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      cb(null, getResourceDir((req.session as any).userId));
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
  },
});
