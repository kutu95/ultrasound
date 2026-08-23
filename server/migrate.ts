import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, getDatabaseSchema } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid schema name: ${name}`);
  }
  return `"${name}"`;
}

async function migrate() {
  const pool = createPool();
  const schemaName = getDatabaseSchema();
  const schemaIdent = quoteIdent(schemaName);

  try {
    if (schemaName !== 'public') {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdent}`);
      console.log(`Using schema ${schemaName}`);
    }

    // Ensure migration tracking and DDL land in the app schema only
    await pool.query(`SET search_path TO ${schemaIdent}, extensions`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql') && f !== 'seed.sql')
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const { rows } = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [version],
      );

      if (rows.length > 0) {
        console.log(`Skip ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying ${file}…`);
      await pool.query('BEGIN');
      try {
        await pool.query(`SET LOCAL search_path TO ${schemaIdent}, extensions`);
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await pool.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Migrations complete.');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
