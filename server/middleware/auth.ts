import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

function extractAgentApiKey(req: Request): string | null {
  // ChatGPT Actions may send the key in several shapes depending on auth UI settings.
  const fromCustom =
    req.header('x-api-key')?.trim() ||
    req.header('api-key')?.trim() ||
    req.header('apikey')?.trim();
  if (fromCustom) return fromCustom;

  const auth = req.header('authorization')?.trim();
  if (!auth) return null;
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  // Some GPT Action configs send Authorization: <key> with no Bearer prefix.
  return auth;
}

function secretsEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** API-key auth for ChatGPT Custom GPT Actions (/api/agent). */
export function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.AGENT_API_KEY?.trim();
  if (!expected) {
    res.status(503).json({ error: 'Agent API is not configured (AGENT_API_KEY missing)' });
    return;
  }

  const provided = extractAgentApiKey(req);
  if (!provided || !secretsEqual(provided, expected)) {
    res.status(401).json({ error: 'Invalid or missing API key' });
    return;
  }
  next();
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
