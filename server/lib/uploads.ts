import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function getUploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return path.resolve(process.cwd(), 'data', 'uploads');
}

export function getMaxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 15 * 1024 * 1024;
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function extensionForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? '';
}

export function caseUploadDir(caseId: string): string {
  return path.join(getUploadRoot(), caseId);
}

export function caseImagePath(caseId: string, storedName: string): string {
  return path.join(caseUploadDir(caseId), storedName);
}

export function ensureCaseUploadDir(caseId: string): string {
  const dir = caseUploadDir(caseId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function makeStoredName(mime: string): string {
  return `${randomUUID()}${extensionForMime(mime)}`;
}

export function deleteCaseUploadDir(caseId: string): void {
  const dir = caseUploadDir(caseId);
  fs.rmSync(dir, { recursive: true, force: true });
}

export function deleteStoredFile(caseId: string, storedName: string): void {
  const filePath = caseImagePath(caseId, storedName);
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
}
