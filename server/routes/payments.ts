import { Router } from 'express';
import type { Pool } from 'pg';
import { desc, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { paymentAllocations, payments } from '../db/schema.js';
import { serializeAllocation, serializePayment, serializeStatementEntry } from '../lib/serialize.js';
import { asyncHandler } from '../middleware/auth.js';

async function allocateFifo(db: Database, paymentId: string, amount: number) {
  const outstanding = await db.execute(sql`
    SELECT id, outstanding
    FROM invoice_balances
    WHERE outstanding > 0
    ORDER BY service_date, invoice_date, invoice_number
  `);

  let remaining = amount;
  for (const row of outstanding.rows as { id: string; outstanding: string | number }[]) {
    if (remaining <= 0) break;
    const due = Number(row.outstanding);
    const apply = Math.min(remaining, due);
    if (apply <= 0) continue;

    await db.insert(paymentAllocations).values({
      paymentId,
      invoiceId: row.id,
      amount: apply,
    });
    remaining -= apply;
  }
}

export function paymentsRouter(db: Database) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(payments).orderBy(desc(payments.paymentDate));
      res.json(rows.map(serializePayment));
    }),
  );

  router.get(
    '/recent',
    asyncHandler(async (req, res) => {
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      const rows = await db
        .select()
        .from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(limit);
      res.json(rows.map(serializePayment));
    }),
  );

  router.get(
    '/allocations',
    asyncHandler(async (_req, res) => {
      const rows = await db.select().from(paymentAllocations);
      res.json(rows.map(serializeAllocation));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = req.body as {
        payment_date: string;
        amount: number;
        reference: string;
        notes?: string;
        allocations?: { invoice_id: string; amount: number }[];
      };

      if (!body.amount || body.amount <= 0) {
        res.status(400).json({ error: 'Payment amount must be greater than zero' });
        return;
      }

      const [payment] = await db
        .insert(payments)
        .values({
          paymentDate: body.payment_date,
          amount: body.amount,
          reference: body.reference ?? '',
          notes: body.notes || null,
        })
        .returning();

      const explicit = (body.allocations ?? []).filter((a) => a.invoice_id && a.amount > 0);
      if (explicit.length > 0) {
        const allocSum = explicit.reduce((s, a) => s + Number(a.amount), 0);
        if (allocSum > body.amount) {
          res.status(400).json({ error: 'Allocations exceed payment amount' });
          return;
        }
        for (const alloc of explicit) {
          await db.insert(paymentAllocations).values({
            paymentId: payment.id,
            invoiceId: alloc.invoice_id,
            amount: alloc.amount,
          });
        }
      } else {
        // Apply payment to oldest outstanding invoices until the amount is used
        await allocateFifo(db, payment.id, Number(body.amount));
      }

      res.status(201).json(serializePayment(payment));
    }),
  );

  return router;
}

export function statementRouter(_db: Database, pool: Pool) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const now = new Date();
      const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const defaultTo = now.toISOString().slice(0, 10);
      const fromDate = (req.query.from_date as string | undefined) || defaultFrom;
      const toDate = (req.query.to_date as string | undefined) || defaultTo;

      const openingResult = await pool.query(
        `SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS opening
         FROM statement_ledger
         WHERE entry_date < $1::date`,
        [fromDate],
      );
      const openingBalance = Number(openingResult.rows[0]?.opening ?? 0);

      const entriesResult = await pool.query(
        `SELECT * FROM statement_ledger
         WHERE entry_date >= $1::date AND entry_date <= $2::date
         ORDER BY entry_date, created_at`,
        [fromDate, toDate],
      );

      const entries = entriesResult.rows.map((r) =>
        serializeStatementEntry(r as Record<string, unknown>),
      );

      const totalDebits = entries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredits = entries.reduce((sum, e) => sum + e.credit, 0);
      const closingBalance = openingBalance + totalDebits - totalCredits;

      res.json({
        from_date: fromDate,
        to_date: toDate,
        opening_balance: openingBalance,
        closing_balance: closingBalance,
        total_debits: totalDebits,
        total_credits: totalCredits,
        entries,
      });
    }),
  );

  return router;
}
