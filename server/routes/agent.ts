import { Router } from 'express';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import multer from 'multer';
import type { Database } from '../db/index.js';
import { caseImages, cases } from '../db/schema.js';
import { storeValidatedCaseImage } from '../lib/caseImageStore.js';
import {
  isPrivateOrLocalHostname,
  validateBase64Image,
  validateImageBuffer,
  type ImageValidationError,
} from '../lib/imageValidation.js';
import { serializeCase, serializeCaseImage } from '../lib/serialize.js';
import { publicUploadPageUrl } from '../lib/uploadTokens.js';
import { getMaxUploadBytes } from '../lib/uploads.js';
import { asyncHandler } from '../middleware/auth.js';

const EXAM_TYPES = new Set([
  'Echocardiography',
  'Abdominal ultrasound',
  'Pregnancy diagnosis',
  'Other',
]);

type CaseBody = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseCaseCreate(body: CaseBody) {
  const examDate = asString(body.exam_date).trim();
  const ownerSurname = asString(body.owner_surname).trim();
  const petName = asString(body.pet_name).trim();
  const examType = asString(body.exam_type).trim();

  if (!examDate || !ownerSurname || !petName || !examType) {
    return { error: 'exam_date, owner_surname, pet_name, and exam_type are required' } as const;
  }
  if (!EXAM_TYPES.has(examType)) {
    return {
      error: `exam_type must be one of: ${[...EXAM_TYPES].join(', ')}`,
    } as const;
  }

  const isFree = Boolean(body.is_free);
  const standardFee = asOptionalNumber(body.standard_fee) ?? 150;
  const actualFee = isFree ? 0 : (asOptionalNumber(body.actual_fee) ?? 150);

  return {
    values: {
      examDate,
      ownerSurname,
      petName,
      species: asString(body.species, 'dog'),
      examType: examType as
        | 'Echocardiography'
        | 'Abdominal ultrasound'
        | 'Pregnancy diagnosis'
        | 'Other',
      findingsText: asString(body.findings_text),
      conclusionText: asString(body.conclusion_text),
      imageNotes: asString(body.image_notes),
      standardFee,
      actualFee,
      isFree,
      freeReason: isFree ? asString(body.free_reason) || null : null,
      billingNote: asString(body.billing_note) || null,
    },
  } as const;
}

function parseCasePatch(body: CaseBody, existing: typeof cases.$inferSelect) {
  const next = { ...existing };

  if (body.exam_date !== undefined) {
    const examDate = asString(body.exam_date).trim();
    if (!examDate) return { error: 'exam_date cannot be empty' } as const;
    next.examDate = examDate;
  }
  if (body.owner_surname !== undefined) {
    const ownerSurname = asString(body.owner_surname).trim();
    if (!ownerSurname) return { error: 'owner_surname cannot be empty' } as const;
    next.ownerSurname = ownerSurname;
  }
  if (body.pet_name !== undefined) {
    const petName = asString(body.pet_name).trim();
    if (!petName) return { error: 'pet_name cannot be empty' } as const;
    next.petName = petName;
  }
  if (body.species !== undefined) next.species = asString(body.species);
  if (body.exam_type !== undefined) {
    const examType = asString(body.exam_type).trim();
    if (!EXAM_TYPES.has(examType)) {
      return {
        error: `exam_type must be one of: ${[...EXAM_TYPES].join(', ')}`,
      } as const;
    }
    next.examType = examType as typeof next.examType;
  }
  if (body.findings_text !== undefined) next.findingsText = asString(body.findings_text);
  if (body.conclusion_text !== undefined) next.conclusionText = asString(body.conclusion_text);
  if (body.image_notes !== undefined) next.imageNotes = asString(body.image_notes);
  if (body.standard_fee !== undefined) {
    next.standardFee = asOptionalNumber(body.standard_fee) ?? next.standardFee;
  }
  if (body.is_free !== undefined) next.isFree = Boolean(body.is_free);
  if (body.free_reason !== undefined) next.freeReason = asString(body.free_reason) || null;
  if (body.billing_note !== undefined) next.billingNote = asString(body.billing_note) || null;
  if (body.actual_fee !== undefined) {
    next.actualFee = asOptionalNumber(body.actual_fee) ?? next.actualFee;
  }

  if (next.isFree) {
    next.actualFee = 0;
    next.freeReason = next.freeReason || asString(body.free_reason) || null;
  } else {
    next.freeReason = null;
  }

  return {
    values: {
      examDate: next.examDate,
      ownerSurname: next.ownerSurname,
      petName: next.petName,
      species: next.species,
      examType: next.examType,
      findingsText: next.findingsText,
      conclusionText: next.conclusionText,
      imageNotes: next.imageNotes,
      standardFee: next.standardFee,
      actualFee: next.actualFee,
      isFree: next.isFree,
      freeReason: next.freeReason,
      billingNote: next.billingNote,
      updatedAt: new Date(),
    },
  } as const;
}

function sendValidationError(
  res: import('express').Response,
  err: ImageValidationError,
) {
  res.status(err.status).json({ error: err.error, message: err.message });
}

function requestOrigin(req: import('express').Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (host) return `${proto}://${host}`;
  return process.env.CORS_ORIGIN?.replace(/\/$/, '') || 'https://ultrasound.margies.app';
}

async function loadAttachableCase(db: Database, caseId: string) {
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return { error: 'NOT_FOUND' as const };
  if (existing.invoiceId) return { error: 'CASE_INVOICED' as const };
  return { case: existing };
}

async function fetchRemoteImage(fileUrl: string) {
  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return {
      status: 400 as const,
      error: 'INVALID_URL',
      message: 'file_url is not a valid URL',
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      status: 400 as const,
      error: 'INVALID_URL',
      message: 'file_url must be http or https',
    };
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    return {
      status: 400 as const,
      error: 'URL_NOT_ALLOWED',
      message: 'file_url host is not allowed',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*' },
    });
    if (!res.ok) {
      return {
        status: 400 as const,
        error: 'URL_FETCH_FAILED',
        message: `Could not download file_url (HTTP ${res.status})`,
      };
    }
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || null;
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const validated = validateImageBuffer(buffer, contentType);
    if ('error' in validated) return validated;
    return validated;
  } catch {
    return {
      status: 400 as const,
      error: 'URL_FETCH_FAILED',
      message: 'Could not download file_url',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function agentRouter(db: Database) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: getMaxUploadBytes(),
      files: 1,
    },
  });

  router.get(
    '/cases',
    asyncHandler(async (req, res) => {
      const examDate = typeof req.query.exam_date === 'string' ? req.query.exam_date : undefined;
      const petName = typeof req.query.pet_name === 'string' ? req.query.pet_name.trim() : '';
      const ownerSurname =
        typeof req.query.owner_surname === 'string' ? req.query.owner_surname.trim() : '';
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

      const conditions = [];
      if (examDate) conditions.push(eq(cases.examDate, examDate));
      if (petName) conditions.push(ilike(cases.petName, `%${petName}%`));
      if (ownerSurname) conditions.push(ilike(cases.ownerSurname, `%${ownerSurname}%`));

      const rows = await db
        .select()
        .from(cases)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(cases.examDate), desc(cases.createdAt))
        .limit(limit);

      res.json(rows.map(serializeCase));
    }),
  );

  router.get(
    '/cases/:id',
    asyncHandler(async (req, res) => {
      const [row] = await db.select().from(cases).where(eq(cases.id, req.params.id)).limit(1);
      if (!row) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      res.json(serializeCase(row));
    }),
  );

  router.post(
    '/cases',
    asyncHandler(async (req, res) => {
      const parsed = parseCaseCreate(req.body as CaseBody);
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const [row] = await db.insert(cases).values(parsed.values).returning();
      const created = serializeCase(row);
      res.status(201).json({
        ...created,
        upload_url: publicUploadPageUrl(row.id, requestOrigin(req)),
        case_url: `https://ultrasound.margies.app/cases/${row.id}`,
      });
    }),
  );

  router.patch(
    '/cases/:id',
    asyncHandler(async (req, res) => {
      const [existing] = await db.select().from(cases).where(eq(cases.id, req.params.id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Cannot edit an invoiced case',
        });
        return;
      }

      const parsed = parseCasePatch(req.body as CaseBody, existing);
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const [row] = await db
        .update(cases)
        .set(parsed.values)
        .where(eq(cases.id, req.params.id))
        .returning();

      res.json(serializeCase(row));
    }),
  );

  router.get(
    '/cases/:id/upload-link',
    asyncHandler(async (req, res) => {
      const loaded = await loadAttachableCase(db, req.params.id);
      if (loaded.error === 'NOT_FOUND') {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (loaded.error === 'CASE_INVOICED') {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Images cannot be attached after invoicing.',
        });
        return;
      }
      res.json({
        case_id: loaded.case.id,
        upload_url: publicUploadPageUrl(loaded.case.id, requestOrigin(req)),
        expires_in_seconds: 3600,
        instructions:
          'Open upload_url in a browser and select ultrasound screenshots. No Base64 needed.',
      });
    }),
  );

  // Preferred for ChatGPT when a resolvable image URL is available
  router.post(
    '/cases/:id/images/from-url',
    asyncHandler(async (req, res) => {
      const loaded = await loadAttachableCase(db, req.params.id);
      if (loaded.error === 'NOT_FOUND') {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (loaded.error === 'CASE_INVOICED') {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Images cannot be attached after invoicing.',
        });
        return;
      }

      const body = req.body as CaseBody;
      const fileUrl = asString(body.file_url).trim();
      const filename = asString(body.filename).trim() || 'download.jpg';
      if (!fileUrl) {
        res.status(400).json({
          error: 'MISSING_FILE_URL',
          message: 'file_url is required',
        });
        return;
      }

      const fetched = await fetchRemoteImage(fileUrl);
      if ('error' in fetched) {
        sendValidationError(res, fetched);
        return;
      }

      const saved = await storeValidatedCaseImage(db, loaded.case.id, fetched, filename);
      res.status(201).json(saved);
    }),
  );

  // Preferred binary upload (multipart) — works from browsers / tools; ChatGPT may not send true binary
  router.post(
    '/cases/:id/images/upload',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          const message =
            err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
              ? 'Image is too large'
              : err.message || 'Upload failed';
          res.status(400).json({ error: 'UPLOAD_FAILED', message });
          return;
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      const loaded = await loadAttachableCase(db, req.params.id);
      if (loaded.error === 'NOT_FOUND') {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (loaded.error === 'CASE_INVOICED') {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Images cannot be attached after invoicing.',
        });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: 'MISSING_FILE',
          message: 'multipart field "file" is required',
        });
        return;
      }

      const validated = validateImageBuffer(file.buffer, file.mimetype);
      if ('error' in validated) {
        sendValidationError(res, validated);
        return;
      }

      const filename =
        asString(req.body?.filename).trim() || file.originalname || 'upload.jpg';
      const saved = await storeValidatedCaseImage(db, loaded.case.id, validated, filename);
      res.status(201).json(saved);
    }),
  );

  // Legacy Base64 JSON — kept for compatibility, with strict validation
  router.post(
    '/cases/:id/images',
    asyncHandler(async (req, res) => {
      const loaded = await loadAttachableCase(db, req.params.id);
      if (loaded.error === 'NOT_FOUND') {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (loaded.error === 'CASE_INVOICED') {
        res.status(403).json({
          error: 'CASE_INVOICED',
          message: 'Images cannot be attached after invoicing.',
        });
        return;
      }

      const body = req.body as CaseBody;

      // Allow file_url on this path too for convenience
      const fileUrl = asString(body.file_url).trim();
      if (fileUrl) {
        const fetched = await fetchRemoteImage(fileUrl);
        if ('error' in fetched) {
          sendValidationError(res, fetched);
          return;
        }
        const filename = asString(body.filename).trim() || 'download.jpg';
        const saved = await storeValidatedCaseImage(db, loaded.case.id, fetched, filename);
        res.status(201).json(saved);
        return;
      }

      const filename = asString(body.filename).trim() || 'upload.bin';
      const contentType = asString(body.content_type).trim().toLowerCase();
      const dataBase64 = asString(body.data_base64);

      if (!dataBase64) {
        res.status(400).json({
          error: 'MISSING_IMAGE',
          message:
            'Provide multipart file via /images/upload, file_url, or valid data_base64. Do not send placeholder text.',
        });
        return;
      }

      const validated = validateBase64Image(dataBase64, contentType || null);
      if ('error' in validated) {
        sendValidationError(res, validated);
        return;
      }

      const saved = await storeValidatedCaseImage(db, loaded.case.id, validated, filename);
      res.status(201).json(saved);
    }),
  );

  router.get(
    '/cases/:id/images',
    asyncHandler(async (req, res) => {
      const [existing] = await db.select().from(cases).where(eq(cases.id, req.params.id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      const rows = await db
        .select()
        .from(caseImages)
        .where(eq(caseImages.caseId, req.params.id))
        .orderBy(asc(caseImages.sortOrder), asc(caseImages.createdAt));
      res.json(rows.map((row) => ({ ...serializeCaseImage(row), success: true })));
    }),
  );

  return router;
}
