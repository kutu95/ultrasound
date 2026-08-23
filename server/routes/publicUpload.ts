import { Router } from 'express';
import multer from 'multer';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { cases } from '../db/schema.js';
import { storeValidatedCaseImage } from '../lib/caseImageStore.js';
import { validateImageBuffer } from '../lib/imageValidation.js';
import { verifyCaseUploadToken } from '../lib/uploadTokens.js';
import { getMaxUploadBytes } from '../lib/uploads.js';
import { asyncHandler } from '../middleware/auth.js';

/**
 * Browser upload page posts here with a signed token (no agent API key needed).
 * ChatGPT should give the user the upload_url from createCase / upload-link.
 */
export function publicUploadRouter(db: Database) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: getMaxUploadBytes(), files: 12 },
  });

  router.post(
    '/upload',
    (req, res, next) => {
      upload.array('files', 12)(req, res, (err) => {
        if (err) {
          res.status(400).json({
            error: 'UPLOAD_FAILED',
            message: err.message || 'Upload failed',
          });
          return;
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      const token = String(req.query.token || req.body?.token || '').trim();
      const verified = verifyCaseUploadToken(token);
      if ('error' in verified) {
        res.status(401).json({ error: 'INVALID_TOKEN', message: verified.error });
        return;
      }

      const [existing] = await db
        .select()
        .from(cases)
        .where(eq(cases.id, verified.caseId))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Images cannot be attached after invoicing.',
        });
        return;
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({
          error: 'MISSING_FILE',
          message: 'Select at least one image file',
        });
        return;
      }

      const saved = [];
      for (const file of files) {
        const validated = validateImageBuffer(file.buffer, file.mimetype);
        if ('error' in validated) {
          res.status(validated.status).json({
            error: validated.error,
            message: `${file.originalname}: ${validated.message}`,
          });
          return;
        }
        saved.push(
          await storeValidatedCaseImage(
            db,
            existing.id,
            validated,
            file.originalname || 'upload.jpg',
          ),
        );
      }

      res.status(201).json({ success: true, count: saved.length, images: saved });
    }),
  );

  return router;
}
