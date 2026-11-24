import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { DB } from './db';
import { apiTokens, sessions } from './schema';
import { getSetting, setSetting } from './seed';

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, n: number) => Promise<Buffer>;
const COOKIE = 'ml_session';
const SESSION_DAYS = 30;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, salt, hex] = stored.split('$');
  if (!salt || !hex) return false;
  const key = await scrypt(pw, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function hasPassword(db: DB) {
  return !!(await getSetting<string>(db, 'password_hash'));
}

export async function setPassword(db: DB, pw: string) {
  await setSetting(db, 'password_hash', await hashPassword(pw));
}

export async function login(c: Context, db: DB, pw: string): Promise<boolean> {
  const stored = await getSetting<string>(db, 'password_hash');
  if (!stored || !(await verifyPassword(pw, stored))) return false;
  const id = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha256(id), expiresAt });
  setCookie(c, COOKIE, id, {
    httpOnly: true,
    sameSite: 'Lax',
    // Chỉ đặt Secure khi thật sự qua HTTPS (Caddy/nginx gửi X-Forwarded-Proto), để chạy thử bằng HTTP vẫn đăng nhập được
    secure: c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:',
    path: '/',
    expires: expiresAt,
  });
  return true;
}

export async function logout(c: Context, db: DB) {
  const id = getCookie(c, COOKIE);
  if (id) await db.delete(sessions).where(eq(sessions.id, sha256(id)));
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function createToken(db: DB, name: string, scopes: string[]) {
  const raw = `ml_${randomBytes(24).toString('base64url')}`;
  const [row] = await db.insert(apiTokens).values({ name, scopes, tokenHash: sha256(raw), prefix: raw.slice(0, 7) }).returning();
  return { ...row, token: raw };
}

export type Principal = { kind: 'session' } | { kind: 'token'; scopes: string[]; tokenId: number };

/** Phiên đăng nhập (cookie) có mọi quyền; API token chỉ có các scope được cấp. */
export function requireAuth(db: DB, scope?: 'import' | 'read'): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      const [tok] = await db
        .select()
        .from(apiTokens)
        .where(and(eq(apiTokens.tokenHash, sha256(auth.slice(7).trim())), isNull(apiTokens.revokedAt)));
      if (!tok) return c.json({ error: 'Token không hợp lệ hoặc đã bị thu hồi' }, 401);
      if (!scope || !(tok.scopes.includes(scope) || (scope === 'read' && tok.scopes.includes('import')))) {
        return c.json({ error: `Token không có quyền ${scope ?? 'này'}` }, 403);
      }
      await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tok.id));
      c.set('principal', { kind: 'token', scopes: tok.scopes, tokenId: tok.id } satisfies Principal);
      return next();
    }
    const id = getCookie(c, COOKIE);
    if (id) {
      const [s] = await db.select().from(sessions).where(and(eq(sessions.id, sha256(id)), gt(sessions.expiresAt, new Date())));
      if (s) {
        c.set('principal', { kind: 'session' } satisfies Principal);
        return next();
      }
    }
    return c.json({ error: 'Chưa đăng nhập' }, 401);
  };
}
