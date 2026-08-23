import fs from 'node:fs';
import { sql, eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { caseImages } from '../db/schema.js';
import { serializeCaseImage } from './serialize.js';
import {
  caseImagePath,
  ensureCaseUploadDir,
  makeStoredName,
} from './uploads.js';
import type { ValidatedImage } from './imageValidation.js';

export async function storeValidatedCaseImage(
  db: Database,
  caseId: string,
  image: ValidatedImage,
  originalName: string,
) {
  const storedName = makeStoredName(image.mimeType);
  ensureCaseUploadDir(caseId);
  const filePath = caseImagePath(caseId, storedName);
  fs.writeFileSync(filePath, image.buffer);

  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${caseImages.sortOrder}), -1)`,
    })
    .from(caseImages)
    .where(eq(caseImages.caseId, caseId));

  const [row] = await db
    .insert(caseImages)
    .values({
      caseId,
      storedName,
      originalName: originalName || `upload${storedName.slice(storedName.lastIndexOf('.'))}`,
      mimeType: image.mimeType,
      sizeBytes: image.buffer.length,
      sortOrder: Number(maxOrder) + 1,
    })
    .returning();

  return {
    ...serializeCaseImage(row),
    success: true as const,
  };
}
