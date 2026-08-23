import { Router } from 'express';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import fs from 'node:fs';
import multer from 'multer';
import type { Database } from '../db/index.js';
import { caseImages, cases, settings } from '../db/schema.js';
import {
  serializeCase,
  serializeCaseImage,
  serializeInvoiceBalance,
  serializeSettings,
} from '../lib/serialize.js';
import {
  caseImagePath,
  deleteCaseUploadDir,
  deleteStoredFile,
  ensureCaseUploadDir,
  getMaxUploadBytes,
  isAllowedImageMime,
  makeStoredName,
} from '../lib/uploads.js';
import { asyncHandler } from '../middleware/auth.js';

export function settingsRouter(db: Database) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
      if (!row) {
        res.status(404).json({ error: 'Settings not found' });
        return;
      }
      res.json(serializeSettings(row));
    }),
  );

  router.patch(
    '/',
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const updates: Partial<typeof settings.$inferInsert> = {};

      if (body.supplier_name !== undefined) updates.supplierName = String(body.supplier_name);
      if (body.supplier_abn !== undefined) updates.supplierAbn = String(body.supplier_abn);
      if (body.bank_account_name !== undefined)
        updates.bankAccountName = String(body.bank_account_name);
      if (body.bsb !== undefined) updates.bsb = String(body.bsb);
      if (body.account_number !== undefined) updates.accountNumber = String(body.account_number);
      if (body.gst_registered !== undefined) updates.gstRegistered = Boolean(body.gst_registered);
      if (body.default_customer_name !== undefined)
        updates.defaultCustomerName = String(body.default_customer_name);
      if (body.default_customer_location !== undefined)
        updates.defaultCustomerLocation = String(body.default_customer_location);
      if (body.invoice_line_description !== undefined)
        updates.invoiceLineDescription = String(body.invoice_line_description);

      const [row] = await db
        .update(settings)
        .set(updates)
        .where(eq(settings.id, 1))
        .returning();

      res.json(serializeSettings(row));
    }),
  );

  return router;
}

export function casesRouter(db: Database) {
  const router = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        try {
          cb(null, ensureCaseUploadDir(req.params.id));
        } catch (err) {
          cb(err as Error, '');
        }
      },
      filename: (_req, file, cb) => {
        cb(null, makeStoredName(file.mimetype));
      },
    }),
    limits: {
      fileSize: getMaxUploadBytes(),
      files: 20,
    },
    fileFilter: (_req, file, cb) => {
      if (!isAllowedImageMime(file.mimetype)) {
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
        return;
      }
      cb(null, true);
    },
  });

  async function assertCaseExists(caseId: string) {
    const [row] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId)).limit(1);
    return row ?? null;
  }

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const examDate = req.query.exam_date as string | undefined;
      const uninvoicedOnly = req.query.uninvoiced_only === 'true';

      const conditions = [];
      if (examDate) conditions.push(eq(cases.examDate, examDate));
      if (uninvoicedOnly) conditions.push(isNull(cases.invoiceId));

      const rows = await db
        .select()
        .from(cases)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(cases.examDate), desc(cases.createdAt));

      res.json(rows.map(serializeCase));
    }),
  );

  router.get(
    '/recent',
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const rows = await db
        .select()
        .from(cases)
        .orderBy(desc(cases.createdAt))
        .limit(limit);
      res.json(rows.map(serializeCase));
    }),
  );

  router.get(
    '/:id/images',
    asyncHandler(async (req, res) => {
      if (!(await assertCaseExists(req.params.id))) {
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

  router.post(
    '/:id/images',
    (req, res, next) => {
      upload.array('images', 20)(req, res, (err) => {
        if (err) {
          const message =
            err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
              ? 'Image is too large'
              : err.message || 'Upload failed';
          res.status(400).json({ error: message });
          return;
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      const caseId = req.params.id;
      const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!existing) {
        for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) {
          deleteStoredFile(caseId, file.filename);
        }
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) {
          deleteStoredFile(caseId, file.filename);
        }
        res.status(403).json({ error: 'Cannot attach images to an invoiced case' });
        return;
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No images uploaded' });
        return;
      }

      const [{ maxOrder }] = await db
        .select({
          maxOrder: sql<number>`coalesce(max(${caseImages.sortOrder}), -1)`,
        })
        .from(caseImages)
        .where(eq(caseImages.caseId, caseId));

      const created = [];
      let order = Number(maxOrder) + 1;
      for (const file of files) {
        const [row] = await db
          .insert(caseImages)
          .values({
            caseId,
            storedName: file.filename,
            originalName: file.originalname || file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            sortOrder: order,
          })
          .returning();
        created.push(serializeCaseImage(row));
        order += 1;
      }

      res.status(201).json(created);
    }),
  );

  router.get(
    '/:id/images/:imageId',
    asyncHandler(async (req, res) => {
      const [row] = await db
        .select()
        .from(caseImages)
        .where(
          and(eq(caseImages.id, req.params.imageId), eq(caseImages.caseId, req.params.id)),
        )
        .limit(1);

      if (!row) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      const filePath = caseImagePath(row.caseId, row.storedName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Image file missing' });
        return;
      }

      res.setHeader('Content-Type', row.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${row.originalName.replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  router.delete(
    '/:id/images/:imageId',
    asyncHandler(async (req, res) => {
      const [caseRow] = await db
        .select()
        .from(cases)
        .where(eq(cases.id, req.params.id))
        .limit(1);
      if (!caseRow) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (caseRow.invoiceId) {
        res.status(403).json({ error: 'Cannot modify images on an invoiced case' });
        return;
      }

      const [row] = await db
        .select()
        .from(caseImages)
        .where(
          and(eq(caseImages.id, req.params.imageId), eq(caseImages.caseId, req.params.id)),
        )
        .limit(1);

      if (!row) {
        res.status(404).json({ error: 'Image not found' });
        return;
      }

      await db.delete(caseImages).where(eq(caseImages.id, row.id));
      deleteStoredFile(row.caseId, row.storedName);
      res.status(204).end();
    }),
  );

  router.get(
    '/:id',
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
    '/',
    asyncHandler(async (req, res) => {
      const body = req.body;
      const isFree = Boolean(body.is_free);

      const [row] = await db
        .insert(cases)
        .values({
          examDate: body.exam_date,
          ownerSurname: body.owner_surname,
          petName: body.pet_name,
          species: body.species ?? '',
          examType: body.exam_type,
          findingsText: body.findings_text ?? '',
          conclusionText: body.conclusion_text ?? '',
          imageNotes: body.image_notes ?? '',
          standardFee: body.standard_fee ?? 150,
          actualFee: isFree ? 0 : (body.actual_fee ?? 150),
          isFree,
          freeReason: isFree ? body.free_reason || null : null,
          billingNote: body.billing_note || null,
        })
        .returning();

      res.status(201).json(serializeCase(row));
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const [existing] = await db
        .select()
        .from(cases)
        .where(eq(cases.id, req.params.id))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        res.status(403).json({ error: 'Cannot edit an invoiced case' });
        return;
      }

      const body = req.body;
      const isFree = Boolean(body.is_free);

      const [row] = await db
        .update(cases)
        .set({
          examDate: body.exam_date,
          ownerSurname: body.owner_surname,
          petName: body.pet_name,
          species: body.species ?? '',
          examType: body.exam_type,
          findingsText: body.findings_text ?? '',
          conclusionText: body.conclusion_text ?? '',
          imageNotes: body.image_notes ?? '',
          standardFee: body.standard_fee ?? 150,
          actualFee: isFree ? 0 : (body.actual_fee ?? 150),
          isFree,
          freeReason: isFree ? body.free_reason || null : null,
          billingNote: body.billing_note || null,
          updatedAt: new Date(),
        })
        .where(eq(cases.id, req.params.id))
        .returning();

      res.json(serializeCase(row));
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const [existing] = await db
        .select()
        .from(cases)
        .where(eq(cases.id, req.params.id))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
      if (existing.invoiceId) {
        res.status(400).json({ error: 'Cannot delete an invoiced case' });
        return;
      }

      // Remove orphaned line items left by voided invoices (pre-fix data)
      await db.execute(sql`
        DELETE FROM invoice_items ii
        USING invoices i
        WHERE ii.invoice_id = i.id
          AND ii.case_id = ${req.params.id}::uuid
          AND i.status = 'void'
      `);

      const blocking = await db.execute(sql`
        SELECT 1
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE ii.case_id = ${req.params.id}::uuid
          AND i.status <> 'void'
        LIMIT 1
      `);

      if (blocking.rows.length > 0) {
        res.status(400).json({ error: 'Cannot delete a case linked to an active invoice' });
        return;
      }

      await db.delete(cases).where(eq(cases.id, req.params.id));
      deleteCaseUploadDir(req.params.id);
      res.status(204).end();
    }),
  );

  return router;
}

export function dashboardRouter(db: Database) {
  const router = Router();

  router.get(
    '/outstanding',
    asyncHandler(async (_req, res) => {
      const result = await db.execute(sql`
        SELECT COALESCE(SUM(outstanding), 0) AS total
        FROM invoice_balances
        WHERE outstanding > 0
      `);
      res.json({ total: Number(result.rows[0]?.total ?? 0) });
    }),
  );

  router.get(
    '/unpaid-invoices',
    asyncHandler(async (_req, res) => {
      const result = await db.execute(sql`
        SELECT * FROM invoice_balances
        WHERE outstanding > 0
        ORDER BY invoice_date DESC
      `);
      res.json(result.rows.map((r) => serializeInvoiceBalance(r as Record<string, unknown>)));
    }),
  );

  return router;
}
