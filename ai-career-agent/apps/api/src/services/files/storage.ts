import multer from 'multer';
import path from 'path';
import fs from 'fs';

const PRIVATE_FILES_DIR = process.env.PRIVATE_FILES_DIR ?? './private-files';

export function getUserUploadDir(userId: string): string {
  const dir = path.join(PRIVATE_FILES_DIR, 'uploads', userId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const resumeUpload = multer({
  storage: multer.diskStorage({
    destination: (req: any, _file: any, cb: any) => {
      const userId = (req.session as any).userId;
      cb(null, getUserUploadDir(userId));
    },
    filename: (_req: any, file: any, cb: any) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});
