import { Router } from 'express';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import fs from 'node:fs';
import type { Database } from '../db/index.js';
import { caseImages, cases } from '../db/schema.js';
import { serializeCase, serializeCaseImage } from '../lib/serialize.js';
import {
  caseImagePath,
  ensureCaseUploadDir,
  getMaxUploadBytes,
  isAllowedImageMime,
  makeStoredName,
} from '../lib/uploads.js';
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

function decodeBase64Image(dataBase64: string): Buffer | null {
  const trimmed = dataBase64.trim();
  const raw = trimmed.includes(',') ? trimmed.slice(trimmed.indexOf(',') + 1) : trimmed;
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

export function agentRouter(db: Database) {
  const router = Router();

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
      res.status(201).json(serializeCase(row));
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
        res.status(403).json({ error: 'Cannot edit an invoiced case' });
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

  router.post(
    '/cases/:id/images',
    asyncHandler(async (req, res) => {
      const [existing] = await db.select().from(cases).where(eq(cases.id, req.params.id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        res.status(403).json({ error: 'Cannot attach images to an invoiced case' });
        return;
      }

      const body = req.body as CaseBody;
      const filename = asString(body.filename).trim() || 'upload.bin';
      const contentType = asString(body.content_type).trim().toLowerCase();
      const dataBase64 = asString(body.data_base64);

      if (!contentType || !dataBase64) {
        res.status(400).json({ error: 'content_type and data_base64 are required' });
        return;
      }
      if (!isAllowedImageMime(contentType)) {
        res.status(400).json({ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' });
        return;
      }

      const buffer = decodeBase64Image(dataBase64);
      if (!buffer) {
        res.status(400).json({ error: 'Invalid data_base64' });
        return;
      }
      if (buffer.length > getMaxUploadBytes()) {
        res.status(400).json({ error: 'Image is too large' });
        return;
      }

      const storedName = makeStoredName(contentType);
      ensureCaseUploadDir(existing.id);
      const filePath = caseImagePath(existing.id, storedName);
      fs.writeFileSync(filePath, buffer);

      const [{ maxOrder }] = await db
        .select({
          maxOrder: sql<number>`coalesce(max(${caseImages.sortOrder}), -1)`,
        })
        .from(caseImages)
        .where(eq(caseImages.caseId, existing.id));

      const [row] = await db
        .insert(caseImages)
        .values({
          caseId: existing.id,
          storedName,
          originalName: filename,
          mimeType: contentType,
          sizeBytes: buffer.length,
          sortOrder: Number(maxOrder) + 1,
        })
        .returning();

      res.status(201).json(serializeCaseImage(row));
    }),
  );

  // Convenience: list images for a case (helps ChatGPT confirm attaches)
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
      res.json(rows.map(serializeCaseImage));
    }),
  );

  return router;
}
