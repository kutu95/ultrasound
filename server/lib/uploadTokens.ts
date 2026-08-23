import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

function secret(): string {
  const key = process.env.AGENT_API_KEY?.trim() || process.env.SESSION_SECRET?.trim();
  if (!key) throw new Error('AGENT_API_KEY or SESSION_SECRET required for upload tokens');
  return key;
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createCaseUploadToken(caseId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${caseId}.${exp}`;
  return `${b64url(payload)}.${sign(payload)}`;
}

export function verifyCaseUploadToken(
  token: string,
): { caseId: string } | { error: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { error: 'Invalid upload token' };
  const [payloadB64, sig] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return { error: 'Invalid upload token' };
  }
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { error: 'Invalid upload token' };
  }
  const [caseId, expStr] = payload.split('.');
  const exp = Number(expStr);
  if (!caseId || !Number.isFinite(exp)) return { error: 'Invalid upload token' };
  if (Math.floor(Date.now() / 1000) > exp) return { error: 'Upload link expired' };
  return { caseId };
}

export function publicUploadPageUrl(caseId: string, origin: string): string {
  const token = createCaseUploadToken(caseId);
  const base = origin.replace(/\/$/, '');
  return `${base}/upload.html?token=${encodeURIComponent(token)}`;
}
