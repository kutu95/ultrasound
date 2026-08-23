import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { users } from '../db/schema.js';
import { asyncHandler } from '../middleware/auth.js';

export function authRouter(db: Database) {
  const router = Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password required' });
        return;
      }

      const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      req.session.userId = user.id;
      req.session.username = user.username;

      res.json({ username: user.username });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          res.status(500).json({ error: 'Failed to logout' });
          return;
        }
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    }),
  );

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      res.json({ username: req.session.username });
    }),
  );

  return router;
}

export async function ensureAdminUser(db: Database) {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin';

  const [existing] = await db.select().from(users).where(eq(users.username, username)).limit(1);

  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({ username, passwordHash });
    console.log(`Created admin user "${username}"`);
  }
}
