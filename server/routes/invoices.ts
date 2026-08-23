import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { cases, invoiceItems, invoices, settings } from '../db/schema.js';
import {
  serializeCase,
  serializeInvoice,
  serializeInvoiceBalance,
  serializeInvoiceItem,
} from '../lib/serialize.js';
import { toISODateString } from '../lib/dates.js';
import { asyncHandler } from '../middleware/auth.js';

export function invoicesRouter(db: Database) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(invoices).orderBy(desc(invoices.invoiceDate));
      res.json(rows.map(serializeInvoice));
    }),
  );

  router.get(
    '/balances',
    asyncHandler(async (_req, res) => {
      const result = await db.execute(sql`
        SELECT * FROM invoice_balances ORDER BY invoice_date DESC
      `);
      res.json(result.rows.map((r) => serializeInvoiceBalance(r as Record<string, unknown>)));
    }),
  );

  router.get(
    '/:id/cases',
    asyncHandler(async (req, res) => {
      const rows = await db
        .select()
        .from(cases)
        .where(eq(cases.invoiceId, req.params.id))
        .orderBy(cases.createdAt);
      res.json(rows.map(serializeCase));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const [row] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, req.params.id))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      res.json(serializeInvoice(row));
    }),
  );

  router.get(
    '/:id/items',
    asyncHandler(async (req, res) => {
      const rows = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, req.params.id))
        .orderBy(invoiceItems.description);
      res.json(rows.map(serializeInvoiceItem));
    }),
  );

  router.post(
    '/draft',
    asyncHandler(async (req, res) => {
      const { service_date } = req.body as { service_date: string };
      if (!service_date) {
        res.status(400).json({ error: 'service_date required' });
        return;
      }

      const numResult = await db.execute(sql`SELECT next_invoice_number() AS num`);
      const invoiceNumber = (numResult.rows[0] as { num: string }).num;

      const [sett] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);

      const [row] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          serviceDate: service_date,
          customerName: sett?.defaultCustomerName ?? 'Heritage Veterinary Hospital',
          customerLocation: sett?.defaultCustomerLocation ?? 'Busselton WA',
          status: 'draft',
        })
        .returning();

      res.status(201).json(serializeInvoice(row));
    }),
  );

  router.post(
    '/:id/issue',
    asyncHandler(async (req, res) => {
      const { case_ids, line_description, final_total, override_reason } = req.body as {
        case_ids: string[];
        line_description: string;
        final_total: number;
        override_reason?: string | null;
      };

      const result = await db.execute(sql`
        SELECT * FROM issue_invoice(
          ${req.params.id}::uuid,
          ${JSON.stringify(case_ids)}::jsonb,
          ${line_description},
          ${final_total}::numeric,
          ${override_reason ?? null}
        )
      `);

      const raw = result.rows[0] as Record<string, unknown>;
      res.json({
        id: raw.id,
        invoice_number: raw.invoice_number,
        invoice_date: toISODateString(raw.invoice_date),
        service_date: toISODateString(raw.service_date),
        customer_name: raw.customer_name,
        customer_location: raw.customer_location,
        status: raw.status,
        suggested_total: Number(raw.suggested_total),
        final_total: Number(raw.final_total),
        override_reason: raw.override_reason,
        notes: raw.notes,
        created_at: new Date(raw.created_at as string).toISOString(),
        updated_at: new Date(raw.updated_at as string).toISOString(),
      });
    }),
  );

  router.post(
    '/:id/void',
    asyncHandler(async (req, res) => {
      const [existing] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, req.params.id))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      if (existing.status === 'void') {
        res.json(serializeInvoice(existing));
        return;
      }

      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, req.params.id));
      await db
        .update(cases)
        .set({ invoiceId: null })
        .where(eq(cases.invoiceId, req.params.id));

      const [row] = await db
        .update(invoices)
        .set({ status: 'void' })
        .where(eq(invoices.id, req.params.id))
        .returning();

      res.json(serializeInvoice(row));
    }),
  );

  return router;
}
