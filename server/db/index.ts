import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const { Pool } = pg;

export function getDatabaseSchema(): string {
  return process.env.DATABASE_SCHEMA?.trim() || 'public';
}

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST ?? 'localhost';
  const port = process.env.DATABASE_PORT ?? '5432';
  const database = process.env.DATABASE_NAME ?? 'ultrasound_dev';
  const user = process.env.DATABASE_USER ?? 'john';
  const password = process.env.DATABASE_PASSWORD ?? '';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function createPool() {
  const schemaName = getDatabaseSchema();
  // Do not put public first — app DDL/DML must land in the app schema.
  // Keep extensions available for gen_random_uuid() on shared Supabase Postgres.
  const searchPath =
    schemaName === 'public'
      ? undefined
      : `-c search_path=${schemaName},extensions`;

  return new Pool({
    connectionString: getDatabaseUrl(),
    options: searchPath,
  });
}

export function createDb(pool?: pg.Pool) {
  const p = pool ?? createPool();
  return drizzle(p, { schema });
}

export type Database = ReturnType<typeof createDb>;
