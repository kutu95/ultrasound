# Ultrasound Ledger

A single-user web app for recording veterinary ultrasound examinations for Heritage Veterinary Hospital (Busselton), generating plain-text report emails, invoices, payment records, and a running balance.

## Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Express + TypeScript
- **Database:** PostgreSQL 17 (standard SQL, no vendor lock-in)
- **ORM:** Drizzle ORM (portable PostgreSQL queries)
- **Auth:** Simple session-based login (replaceable later)

The database layer uses standard PostgreSQL features only. Migrations are plain SQL files runnable with `psql` or `npm run db:migrate`. The app works against any PostgreSQL server, including a Supabase-hosted Postgres instance if you point `DATABASE_URL` at it later.

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ultrasound_dev
DATABASE_USER=john
DATABASE_PASSWORD=ultrasound_dev_password
```

### 3. Run migrations

```bash
npm run db:migrate
```

Optional sample data:

```bash
npm run db:seed
```

Or run SQL manually:

```bash
psql postgresql://john:ultrasound_dev_password@localhost:5432/ultrasound_dev \
  -f migrations/001_initial.sql
```

### 4. Start development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

Sign in with the default admin credentials from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`, default `admin` / `admin`).

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Full PostgreSQL connection string (alternative to individual `DATABASE_*` vars) |
| `DATABASE_HOST` | Database host (default `localhost`) |
| `DATABASE_PORT` | Database port (default `5432`) |
| `DATABASE_NAME` | Database name |
| `DATABASE_USER` | Database user |
| `DATABASE_PASSWORD` | Database password |
| `PORT` | API server port (default `3001`) |
| `SESSION_SECRET` | Session signing secret |
| `CORS_ORIGIN` | Frontend origin for CORS (default `http://localhost:5173`) |
| `ADMIN_USERNAME` | Initial admin username (created on first start) |
| `ADMIN_PASSWORD` | Initial admin password |
| `VITE_API_URL` | Frontend API base URL (optional; dev uses Vite proxy) |

## Production

```bash
npm run build
NODE_ENV=production npm start
```

In production the Express server serves the built frontend from `dist/` and the API on the same port.

Protect the app with a reverse proxy (Cloudflare Access, basic auth, etc.) as needed.

## Project structure

```
migrations/          Standard SQL migrations + seed
server/
  db/                Drizzle schema and connection
  routes/            REST API routes
  lib/               Serializers
  index.ts           Express app entry point
src/                 React frontend
```

## Billing rule

| Billable exams | Suggested total |
|----------------|-----------------|
| 1              | $300            |
| 2              | $300            |
| 3              | $450            |
| 4              | $600            |

Free exams are $0. All amounts are manually editable.

## Authentication

Session cookies with PostgreSQL-backed session store. The auth layer is isolated in `server/routes/auth.ts` and can be swapped for OAuth, Cloudflare Access headers, or another provider without changing business logic.

## What is intentionally not used

- Supabase client libraries
- Supabase Auth, Storage, or Edge Functions
- Vendor-specific database extensions beyond `pgcrypto` (standard in PostgreSQL)
