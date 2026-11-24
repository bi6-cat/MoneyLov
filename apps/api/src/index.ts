import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { openDb } from './db';
import { createApp } from './app';
import { seed } from './seed';
import { hasPassword, setPassword } from './auth';

const { db } = await openDb();
await seed(db);
if (process.env.ADMIN_PASSWORD && !(await hasPassword(db))) {
  await setPassword(db, process.env.ADMIN_PASSWORD);
  console.log('Đã đặt mật khẩu từ ADMIN_PASSWORD');
}

const app = createApp(db);

// Phục vụ giao diện đã build (apps/web/dist), mọi đường dẫn khác trả index.html (SPA)
const webDir = process.env.WEB_DIR ?? resolve(process.cwd(), '../web/dist');
if (existsSync(webDir)) {
  const indexHtml = readFileSync(resolve(webDir, 'index.html'), 'utf8');
  app.use('/assets/*', serveStatic({ root: webDir, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }));
  app.use('/*', serveStatic({ root: webDir }));
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Không có route này' }, 404) : c.html(indexHtml)));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, () => console.log(`MoneyLov API: http://localhost:${port}`));
