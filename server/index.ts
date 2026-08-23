import 'dotenv/config';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, createPool } from './db/index.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter, ensureAdminUser } from './routes/auth.js';
import { casesRouter, dashboardRouter, settingsRouter } from './routes/cases.js';
import { invoicesRouter } from './routes/invoices.js';
import { paymentsRouter, statementRouter } from './routes/payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = createPool();
const db = createDb(pool);
const PgSession = connectPgSimple(session);

const app = express();
const port = Number(process.env.PORT) || 3001;

// Required for secure cookies behind Cloudflare Tunnel / reverse proxies
app.set('trust proxy', 1);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json());

app.use(
  session({
    store: new PgSession({ pool, tableName: 'sessions', createTableIfMissing: false }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter(db));

app.use('/api', requireAuth);
app.use('/api/settings', settingsRouter(db));
app.use('/api/cases', casesRouter(db));
app.use('/api/invoices', invoicesRouter(db));
app.use('/api/payments', paymentsRouter(db));
app.use('/api/statement', statementRouter(db, pool));
app.use('/api/dashboard', dashboardRouter(db));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err.message.includes('RAISE')
    ? err.message.split('ERROR:').pop()?.trim() ?? err.message
    : err.message;
  res.status(500).json({ error: message });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

async function start() {
  await ensureAdminUser(db);
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${port} is already in use. Stop the other process (lsof -ti :${port} | xargs kill) or set PORT in .env.`,
      );
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
