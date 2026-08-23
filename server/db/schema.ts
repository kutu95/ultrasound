import {
  boolean,
  date,
  integer,
  json,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const examTypeEnum = pgEnum('exam_type', [
  'Echocardiography',
  'Abdominal ultrasound',
  'Pregnancy diagnosis',
  'Other',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'paid',
  'void',
]);

export const settings = pgTable('settings', {
  id: integer('id').primaryKey(),
  supplierName: text('supplier_name').notNull().default(''),
  supplierAbn: text('supplier_abn').notNull().default(''),
  bankAccountName: text('bank_account_name').notNull().default(''),
  bsb: text('bsb').notNull().default(''),
  accountNumber: text('account_number').notNull().default(''),
  gstRegistered: boolean('gst_registered').notNull().default(false),
  defaultCustomerName: text('default_customer_name')
    .notNull()
    .default('Heritage Veterinary Hospital'),
  defaultCustomerLocation: text('default_customer_location')
    .notNull()
    .default('Busselton WA'),
  invoiceLineDescription: text('invoice_line_description')
    .notNull()
    .default('Repairs, IT support'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  examDate: date('exam_date').notNull(),
  ownerSurname: text('owner_surname').notNull(),
  petName: text('pet_name').notNull(),
  species: text('species').notNull().default(''),
  examType: examTypeEnum('exam_type').notNull(),
  findingsText: text('findings_text').notNull().default(''),
  conclusionText: text('conclusion_text').notNull().default(''),
  imageNotes: text('image_notes').notNull().default(''),
  standardFee: numeric('standard_fee', { precision: 10, scale: 2, mode: 'number' })
    .notNull()
    .default(150),
  actualFee: numeric('actual_fee', { precision: 10, scale: 2, mode: 'number' })
    .notNull()
    .default(150),
  isFree: boolean('is_free').notNull().default(false),
  freeReason: text('free_reason'),
  billingNote: text('billing_note'),
  invoiceId: uuid('invoice_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const caseImages = pgTable('case_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  storedName: text('stored_name').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  invoiceDate: date('invoice_date').notNull().defaultNow(),
  serviceDate: date('service_date').notNull(),
  customerName: text('customer_name').notNull().default('Heritage Veterinary Hospital'),
  customerLocation: text('customer_location').notNull().default('Busselton WA'),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  suggestedTotal: numeric('suggested_total', { precision: 10, scale: 2, mode: 'number' })
    .notNull()
    .default(0),
  finalTotal: numeric('final_total', { precision: 10, scale: 2, mode: 'number' })
    .notNull()
    .default(0),
  overrideReason: text('override_reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull(),
  caseId: uuid('case_id'),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).notNull().default(0),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentDate: date('payment_date').notNull().defaultNow(),
  amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  reference: text('reference').notNull().default(''),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).notNull(),
});

export const sessions = pgTable('sessions', {
  sid: varchar('sid').primaryKey(),
  sess: json('sess').notNull(),
  expire: timestamp('expire', { withTimezone: true }).notNull(),
});

export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
