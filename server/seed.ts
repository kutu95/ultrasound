import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedFile = path.join(__dirname, '..', 'migrations', 'seed.sql');

async function seed() {
  const pool = createPool();
  try {
    const sql = fs.readFileSync(seedFile, 'utf8');
    console.log('Running seed…');
    await pool.query(sql);
    console.log('Seed complete.');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
