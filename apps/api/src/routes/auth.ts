import { Hono } from 'hono';
import { z } from 'zod';
import type { DB } from '../db';
import { hasPassword, login, logout, requireAuth, setPassword, verifyPassword } from '../auth';
import { getSetting } from '../seed';
import { HttpError } from '../services/lookups';

const attempts = new Map<string, { n: number; until: number }>();

export function authRoutes(db: DB) {
  const r = new Hono();

  r.get('/status', async (c) => c.json({ setup: !(await hasPassword(db)) }));

  /** Lần đầu: đặt mật khẩu. Chỉ dùng được khi chưa có mật khẩu. */
  r.post('/setup', async (c) => {
    if (await hasPassword(db)) throw new HttpError(409, 'Đã đặt mật khẩu');
    const { password } = z.object({ password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự') }).parse(await c.req.json());
    await setPassword(db, password);
    await login(c, db, password);
    return c.json({ ok: true });
  });

  r.post('/login', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const a = attempts.get(ip);
    if (a && a.until > Date.now()) throw new HttpError(429, 'Thử sai nhiều lần, đợi vài phút.');
    const { password } = z.object({ password: z.string() }).parse(await c.req.json());
    if (!(await login(c, db, password))) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
      throw new HttpError(401, 'Sai mật khẩu');
    }
    attempts.delete(ip);
    return c.json({ ok: true });
  });

  r.post('/logout', async (c) => {
    await logout(c, db);
    return c.json({ ok: true });
  });

  r.get('/me', requireAuth(db), (c) => c.json({ ok: true }));

  r.post('/password', requireAuth(db), async (c) => {
    const { current, next } = z.object({ current: z.string(), next: z.string().min(8) }).parse(await c.req.json());
    const stored = await getSetting<string>(db, 'password_hash');
    if (!stored || !(await verifyPassword(current, stored))) throw new HttpError(401, 'Mật khẩu hiện tại không đúng');
    await setPassword(db, next);
    return c.json({ ok: true });
  });

  return r;
}
