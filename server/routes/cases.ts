import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { cases, settings } from '../db/schema.js';
import { serializeCase, serializeInvoiceBalance, serializeSettings } from '../lib/serialize.js';
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
        })
        .where(eq(cases.id, req.params.id))
        .returning();

      if (!row) {
        res.status(404).json({ error: 'Case not found' });
        return;
      }
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
