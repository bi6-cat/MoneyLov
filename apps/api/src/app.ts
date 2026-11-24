import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { DB } from './db';
import { requireAuth, type Principal } from './auth';
import { HttpError } from './services/lookups';
import { authRoutes } from './routes/auth';
import { metaRoutes } from './routes/meta';
import { transactionRoutes } from './routes/transactions';
import { importRoutes } from './routes/import';
import { periodRoutes } from './routes/periods';
import { planningRoutes } from './routes/planning';
import { reportRoutes } from './routes/reports';
import { adminRoutes } from './routes/admin';

export type Env = { Variables: { principal: Principal } };

export function createApp(db: DB) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError) return c.json({ error: 'Dữ liệu không hợp lệ', issues: err.issues }, 422);
    console.error(err);
    return c.json({ error: 'Lỗi máy chủ', detail: String(err?.message ?? err) }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/auth', authRoutes(db));

  // Claude dùng token: nạp file (import) và đọc dữ liệu học (read)
  app.use('/api/import/*', requireAuth(db, 'import'));
  app.use('/api/import', requireAuth(db, 'import'));
  app.route('/api/import', importRoutes(db));
  app.use('/api/learning-export', requireAuth(db, 'read'));

  // Mọi route khác cần phiên đăng nhập (token chỉ dùng được ở các route trên)
  app.use('/api/*', async (c, next) => {
    if (c.get('principal')) return next();
    return requireAuth(db)(c, next);
  });
  app.use('/api/*', async (c, next) => {
    const p = c.get('principal');
    if (p?.kind === 'token' && !c.req.path.startsWith('/api/learning-export')) return c.json({ error: 'Token không dùng được cho route này' }, 403);
    return next();
  });

  app.route('/api', metaRoutes(db));
  app.route('/api/transactions', transactionRoutes(db));
  app.route('/api/periods', periodRoutes(db));
  app.route('/api', planningRoutes(db));
  app.route('/api/reports', reportRoutes(db));
  app.route('/api', adminRoutes(db));
  return app;
}
